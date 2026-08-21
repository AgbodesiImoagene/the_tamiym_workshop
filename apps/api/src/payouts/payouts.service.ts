import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CampaignLedgerService } from './campaign-ledger.service';
import {
  PaymentProvider,
  PayoutStatus,
  AuditOutcome,
  AuditSource,
  NotificationChannel,
  PayoutRunStatus,
  OrganizerApplicationStatus,
  AuditAction,
} from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { DEFAULT_CURRENCY } from '../constants';
import { ObservabilityService } from '../observability/observability.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import {
  ADMIN_NOTIF_PAYOUT_FAILED,
  ADMIN_NOTIF_PAYOUT_SUCCEEDED,
} from '../admin-notifications/admin-notification-events';
import {
  OUTBOX_EVENT_ORGANIZER_PAYOUT_FAILED,
  OUTBOX_EVENT_ORGANIZER_PAYOUT_SUCCEEDED,
} from '../mail/mail-outbox-templates';
import {
  TransferWebhookEventName,
  allowedFromStatuses,
  classifySkippedTransition,
  isTerminalPayoutStatus,
  payoutTransferBusinessKey,
  shouldRecordSuccessLedger,
  shouldReleaseReserve,
  transferEventToStatus,
} from './payout-transfer-transitions';
import { toPaystackTransferReference } from './paystack-transfer-reference';
import {
  maskAccountNumber,
  PAYOUT_ELIGIBILITY_POLICY_VERSION,
  PayoutEligibilityGate,
  resolvePayoutBankResolutionMode,
  stubRecipientCodeForProfile,
} from './payout-eligibility';
import {
  assertPayoutEligible,
  evaluateForGate,
  snapshotFromResult,
  toEligibilityProfile,
} from './payout-eligibility.helpers';

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class PayoutsService {
  private readonly logger = new Logger(PayoutsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private campaignLedger: CampaignLedgerService,
    private audit: AuditService,
    private observability: ObservabilityService,
    private notificationOutboxDelivery: NotificationOutboxDeliveryService,
    private adminNotify: AdminNotifyService,
  ) {}

  /**
   * Resolve or create Paystack transfer recipient for a payout profile. Returns recipient_code.
   */
  async resolveRecipient(profileId: string): Promise<string> {
    return this.observability.startSpan(
      'payouts.resolve_recipient',
      { 'payout.profile_id': profileId },
      async () => {
        const profile = await this.prisma.userPayoutProfile.findUnique({
          where: { id: profileId },
        });
        if (!profile) throw new NotFoundException('Payout profile not found');
        if (profile.recipientCode) return profile.recipientCode;

        const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');
        if (!secretKey)
          throw new BadRequestException('Paystack not configured');

        const res = await fetch('https://api.paystack.co/transferrecipient', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'nuban',
            name: profile.accountName,
            account_number: profile.accountNumber,
            bank_code: profile.bankCode,
          }),
        });
        const data = (await res.json()) as {
          status?: boolean;
          data?: { recipient_code: string };
          message?: string;
        };
        if (!res.ok || !data.status || !data.data?.recipient_code) {
          throw new BadRequestException(
            data.message ?? 'Failed to create transfer recipient',
          );
        }
        await this.prisma.userPayoutProfile.update({
          where: { id: profileId },
          data: { recipientCode: data.data.recipient_code },
        });
        return data.data.recipient_code;
      },
    );
  }

  /**
   * Call Paystack transfer API. Returns reference for idempotent status updates.
   */
  async initiateTransfer(
    recipientCode: string,
    amount: number,
    currency: string,
    reason: string,
    idempotencyKey?: string,
  ): Promise<{ reference: string | null }> {
    return this.observability.startSpan(
      'payouts.initiate_transfer',
      { 'payout.amount': amount, 'payout.currency': currency },
      async () => {
        const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');
        if (!secretKey)
          throw new BadRequestException('Paystack not configured');
        const amountKobo = Math.round(amount * 100);
        if (amountKobo < 100) {
          throw new BadRequestException('Minimum payout is 1 NGN');
        }

        const headers: Record<string, string> = {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        };
        // Paystack transfer idempotency is the body `reference` (reuse on
        // inconclusive retries). Also send Idempotency-Key when present.
        const reference = idempotencyKey
          ? toPaystackTransferReference(idempotencyKey)
          : undefined;
        if (reference) {
          headers['Idempotency-Key'] = reference;
        }
        const res = await fetch('https://api.paystack.co/transfer', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            source: 'balance',
            amount: amountKobo,
            recipient: recipientCode,
            reason,
            ...(reference ? { reference } : {}),
          }),
        });
        const data = (await res.json()) as {
          status?: boolean;
          data?: { reference?: string; transfer_code?: string };
          message?: string;
        };
        if (!res.ok || !data.status) {
          throw new BadRequestException(
            data.message ?? 'Paystack transfer failed',
          );
        }
        const providerReference =
          data.data?.reference ?? data.data?.transfer_code ?? reference ?? null;
        return { reference: providerReference };
      },
    );
  }

  /**
   * Initiate a payout for a campaign (admin ad-hoc). Uses campaign's payout profile or organizer's default.
   * Mirrors executeSinglePayout's ledger pattern: PROCESSING → RESERVED → INITIATED (or FAILED on error).
   */
  async initiatePayout(
    campaignId: string,
    amount: number,
    reason?: string,
    actorUserId?: string,
  ): Promise<{ id: string; status: string; providerRef: string | null }> {
    return this.observability.startSpan(
      'payouts.initiate_payout',
      { 'campaign.id': campaignId, 'payout.amount': amount },
      async () => {
        const campaign = await this.prisma.campaign.findUnique({
          where: { id: campaignId },
          include: {
            payoutProfile: true,
            organizer: {
              include: {
                organizerApplications: {
                  where: { status: OrganizerApplicationStatus.APPROVED },
                  orderBy: { reviewedAt: 'desc' },
                  take: 1,
                  select: { termsVersion: true },
                },
                payoutProfiles: {
                  where: { isDefault: true },
                  take: 1,
                },
              },
            },
          },
        });
        if (!campaign) throw new NotFoundException('Campaign not found');

        const profile =
          campaign.payoutProfile ?? campaign.organizer.payoutProfiles?.[0];
        if (!profile) {
          throw new BadRequestException(
            'Campaign or organizer has no payout profile configured',
          );
        }

        const eligibility = evaluateForGate({
          gate: PayoutEligibilityGate.PROVIDER_INITIATE,
          organiser: {
            id: campaign.organizer.id,
            role: campaign.organizer.role,
            status: campaign.organizer.status,
            emailVerifiedAt: campaign.organizer.emailVerifiedAt,
            phone: campaign.organizer.phone,
            termsVersion:
              campaign.organizer.organizerApplications[0]?.termsVersion ?? null,
          },
          profile: toEligibilityProfile(profile),
        });
        assertPayoutEligible(eligibility);

        const currency = (campaign.currency as 'NGN') ?? DEFAULT_CURRENCY;

        let snapshotRecipientCode = profile.recipientCode;
        if (!snapshotRecipientCode) {
          const mode = resolvePayoutBankResolutionMode(
            this.config.get<string>('PAYOUT_BANK_RESOLUTION_MODE'),
            this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV,
          );
          snapshotRecipientCode =
            mode === 'stub'
              ? stubRecipientCodeForProfile(
                  profile.id,
                  profile.destinationVersion,
                )
              : await this.resolveRecipient(profile.id);
        }

        // Create the payout row in PROCESSING so it is visible before hitting Paystack.
        const payout = await this.prisma.payout.create({
          data: {
            campaignId,
            recipientUserId: campaign.organizerId,
            provider: PaymentProvider.PAYSTACK,
            status: PayoutStatus.PROCESSING,
            currency,
            amount,
            snapshotBankCode: profile.bankCode,
            snapshotAccountName: profile.accountName,
            snapshotAccountMask: maskAccountNumber(profile.accountNumber),
            snapshotRecipientCode,
            snapshotProfileId: profile.id,
            snapshotDestinationVersion: profile.destinationVersion,
            policyVersion: PAYOUT_ELIGIBILITY_POLICY_VERSION,
            eligibilitySnapshot: snapshotFromResult(
              eligibility,
              campaign.organizerId,
            ),
          },
        });

        // Reserve the balance immediately — eligible balance must be reduced
        // before the external transfer is initiated, so a concurrent payout
        // cannot double-spend the same balance.
        await this.campaignLedger.createPayoutReserved(
          campaignId,
          payout.id,
          amount,
          currency,
        );

        try {
          const idempotencyKey = `payout-${payout.id}`;
          const result = await this.initiateTransfer(
            snapshotRecipientCode,
            amount,
            currency,
            reason ?? 'Campaign payout',
            idempotencyKey,
          );

          await this.prisma.payout.update({
            where: { id: payout.id },
            data: {
              status: PayoutStatus.INITIATED,
              providerRef: result.reference,
              idempotencyKey,
              snapshotRecipientCode,
            },
          });

          await this.audit.log({
            eventName: 'admin.payout.initiated',
            action: AuditAction.PAYOUT,
            entityType: 'Payout',
            entityId: payout.id,
            actorUserId: actorUserId ?? null,
            targetType: 'Campaign',
            targetId: campaignId,
            after: {
              status: PayoutStatus.INITIATED,
              providerRef: result.reference,
              amount,
              reason: reason ?? null,
            },
            note: 'Admin initiated campaign payout',
          });
          this.observability.recordPayout({ outcome: 'success' });
          return {
            id: payout.id,
            status: PayoutStatus.INITIATED,
            providerRef: result.reference,
          };
        } catch (err) {
          // Release the reserved balance since the transfer did not go through.
          await this.campaignLedger.createPayoutFailed(
            campaignId,
            payout.id,
            amount,
            currency,
            { error: err instanceof Error ? err.message : String(err) },
          );
          await this.prisma.payout.update({
            where: { id: payout.id },
            data: {
              status: PayoutStatus.FAILED,
              failureReason: err instanceof Error ? err.message : String(err),
            },
          });
          this.observability.recordPayout({ outcome: 'failure' });
          throw err;
        }
      },
    );
  }

  /**
   * Apply a Paystack transfer webhook exactly once per (event, providerRef).
   * Conditional status transition + ledger effect + claim + run completion are atomic.
   * Returns true when at least one matching payout row exists.
   */
  async applyTransferWebhookEvent(
    event: TransferWebhookEventName,
    reference: string,
    rawEvent?: object,
  ): Promise<boolean> {
    const payouts = await this.prisma.payout.findMany({
      where: { providerRef: reference },
      include: {
        recipient: { select: { id: true, email: true, firstName: true } },
        campaign: { select: { id: true, title: true } },
      },
    });
    if (payouts.length === 0) return false;

    const toStatus = transferEventToStatus(event);
    const businessKey = payoutTransferBusinessKey(event, reference);

    for (const payout of payouts) {
      const amount = Number(payout.amount);
      const currency = payout.currency;
      type ApplyResult =
        | { kind: 'applied'; fromStatus: PayoutStatus }
        | { kind: 'skip'; status: PayoutStatus };

      let result: ApplyResult;
      try {
        result = await this.prisma.$transaction(async (tx) => {
          const fromStatuses = allowedFromStatuses(toStatus);
          // Retry CAS when a concurrent transition wins: re-read and apply if
          // the new status is still an allowed source (e.g. success then reverse).
          for (let attempt = 0; attempt < 8; attempt++) {
            const current = await tx.payout.findUniqueOrThrow({
              where: { id: payout.id },
              select: { status: true },
            });
            if (!fromStatuses.includes(current.status)) {
              return { kind: 'skip' as const, status: current.status };
            }

            const updated = await tx.payout.updateMany({
              where: {
                id: payout.id,
                status: current.status,
              },
              data: {
                status: toStatus,
                ...(rawEvent ? { rawEvent } : {}),
              },
            });

            if (updated.count !== 1) {
              continue;
            }

            const fromStatus = current.status;

            if (shouldRecordSuccessLedger(toStatus)) {
              await this.campaignLedger.createPayoutSucceeded(
                payout.campaignId,
                payout.id,
                amount,
                currency,
                tx,
              );
            }
            if (shouldReleaseReserve(fromStatus, toStatus)) {
              await this.campaignLedger.createPayoutFailed(
                payout.campaignId,
                payout.id,
                amount,
                currency,
                { transferEvent: event, fromStatus },
                tx,
              );
            }

            await tx.payoutProviderEventClaim.create({
              data: {
                provider: payout.provider ?? PaymentProvider.PAYSTACK,
                businessKey,
                payoutId: payout.id,
                fromStatus,
                toStatus,
              },
            });

            await this.audit.log(
              {
                eventName: 'webhook.payout.status_updated',
                action: AuditAction.PAYOUT,
                entityType: 'Payout',
                entityId: payout.id,
                outcome:
                  toStatus === PayoutStatus.FAILED ||
                  toStatus === PayoutStatus.REVERSED
                    ? AuditOutcome.FAILURE
                    : AuditOutcome.SUCCESS,
                before: { status: fromStatus },
                after: {
                  status: toStatus,
                  providerRef: reference,
                  businessKey,
                },
                metadata: rawEvent,
                note: 'Paystack transfer webhook applied payout transition',
                source: AuditSource.WEBHOOK,
              },
              tx,
            );

            if (payout.payoutRunId && isTerminalPayoutStatus(toStatus)) {
              // Serialize run completion checks so concurrent sibling terminals
              // cannot both miss COMPLETED under Read Committed.
              await tx.$executeRaw`
                SELECT id FROM "payout_runs" WHERE id = ${payout.payoutRunId} FOR UPDATE
              `;
              const allInRun = await tx.payout.findMany({
                where: { payoutRunId: payout.payoutRunId },
                select: { status: true },
              });
              const allTerminal = allInRun.every((p) =>
                isTerminalPayoutStatus(p.status),
              );
              if (allTerminal) {
                await tx.payoutRun.update({
                  where: { id: payout.payoutRunId },
                  data: {
                    status: PayoutRunStatus.COMPLETED,
                    executedAt: new Date(),
                  },
                });
              }
            }

            return { kind: 'applied' as const, fromStatus };
          }

          const finalStatus = await tx.payout.findUniqueOrThrow({
            where: { id: payout.id },
            select: { status: true },
          });
          return { kind: 'skip' as const, status: finalStatus.status };
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          this.observability.recordPayoutTransferEvent('duplicate');
          this.logger.log(
            `Duplicate transfer webhook ignored for ${businessKey} (claim or ledger unique)`,
          );
          continue;
        }
        throw error;
      }

      if (result.kind !== 'applied') {
        const skip = classifySkippedTransition(result.status, toStatus);
        this.observability.recordPayoutTransferEvent(skip);
        continue;
      }

      this.observability.recordPayoutTransferEvent('applied');
      this.observability.recordPayout({
        outcome:
          toStatus === PayoutStatus.FAILED || toStatus === PayoutStatus.REVERSED
            ? 'failure'
            : 'success',
      });

      if (
        toStatus === PayoutStatus.SUCCEEDED ||
        toStatus === PayoutStatus.FAILED
      ) {
        const email = payout.recipient?.email;
        if (email) {
          const eventName =
            toStatus === PayoutStatus.SUCCEEDED
              ? OUTBOX_EVENT_ORGANIZER_PAYOUT_SUCCEEDED
              : OUTBOX_EVENT_ORGANIZER_PAYOUT_FAILED;
          const dedupeKey = `${eventName}:${payout.id}`;
          try {
            const notification = await this.prisma.notificationOutbox.create({
              data: {
                eventName,
                channel: NotificationChannel.EMAIL,
                recipient: email,
                recipientUserId: payout.recipient.id,
                dedupeKey,
                payload: {
                  payoutId: payout.id,
                  amount,
                  currency,
                  campaignTitle: payout.campaign?.title ?? 'Your campaign',
                  firstName: payout.recipient.firstName,
                  failureReason:
                    toStatus === PayoutStatus.FAILED
                      ? (payout.failureReason ??
                        'The transfer did not complete. Check your payout profile in the app.')
                      : '',
                },
              },
            });
            await this.notificationOutboxDelivery.enqueueDelivery(
              notification.id,
            );
          } catch (error) {
            if (!isUniqueConstraintError(error)) throw error;
          }

          await this.adminNotify.emit(
            toStatus === PayoutStatus.SUCCEEDED
              ? ADMIN_NOTIF_PAYOUT_SUCCEEDED
              : ADMIN_NOTIF_PAYOUT_FAILED,
            {
              payoutId: payout.id,
              amount,
              currency,
              campaignTitle: payout.campaign?.title ?? '',
              recipientEmail: email,
              failureReason:
                toStatus === PayoutStatus.FAILED
                  ? (payout.failureReason ??
                    'The transfer did not complete. Check your payout profile in the app.')
                  : '',
            },
          );
        }
      }
    }

    return true;
  }

  /**
   * @deprecated Prefer applyTransferWebhookEvent. Kept for callers that only know a status.
   */
  async updatePayoutStatusByReference(
    reference: string,
    status: PayoutStatus,
    rawEvent?: object,
  ): Promise<
    { campaignId: string; id: string; amount: number; currency: string }[]
  > {
    const event: TransferWebhookEventName =
      status === PayoutStatus.SUCCEEDED
        ? 'transfer.success'
        : status === PayoutStatus.REVERSED
          ? 'transfer.reversed'
          : 'transfer.failed';
    await this.applyTransferWebhookEvent(event, reference, rawEvent);
    const payouts = await this.prisma.payout.findMany({
      where: { providerRef: reference },
    });
    return payouts.map((p) => ({
      campaignId: p.campaignId,
      id: p.id,
      amount: Number(p.amount),
      currency: p.currency,
    }));
  }

  /**
   * Request an off-ledger manual adjustment (arbitrary amount). Requires two-person approval.
   */
  async requestManualAdjustment(
    campaignId: string,
    amount: number,
    reason: string,
    requestedByUserId: string,
  ): Promise<{ id: string; status: string }> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: {
        payoutProfile: true,
        organizer: {
          include: {
            payoutProfiles: { where: { isDefault: true }, take: 1 },
          },
        },
      },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const profile =
      campaign.payoutProfile ?? campaign.organizer.payoutProfiles?.[0];
    if (!profile) {
      throw new BadRequestException(
        'Campaign or organizer has no payout profile',
      );
    }
    if (amount < 0.01) {
      throw new BadRequestException('Amount must be at least 0.01');
    }

    const payout = await this.prisma.payout.create({
      data: {
        campaignId,
        recipientUserId: campaign.organizerId,
        provider: PaymentProvider.PAYSTACK,
        status: PayoutStatus.PENDING_APPROVAL,
        currency: (campaign.currency as 'NGN') ?? DEFAULT_CURRENCY,
        amount,
        isManualAdjustment: true,
        requestedByUserId,
        snapshotBankCode: profile.bankCode,
        snapshotAccountName: profile.accountName,
        snapshotAccountMask: profile.accountNumber
          ? `***${profile.accountNumber.slice(-4)}`
          : null,
      },
    });

    await this.audit.log({
      eventName: 'admin.payout.manual_adjustment.requested',
      action: AuditAction.CREATE,
      entityType: 'Payout',
      entityId: payout.id,
      actorUserId: requestedByUserId,
      after: { amount, reason: reason.slice(0, 500), isManualAdjustment: true },
      note: 'Manual adjustment requested',
    });

    return { id: payout.id, status: payout.status };
  }

  /**
   * Approve and execute a manual adjustment. Requester cannot be approver.
   */
  async approveManualAdjustment(
    payoutId: string,
    approvedByUserId: string,
    approvalReason?: string,
  ): Promise<{ id: string; status: string; providerRef: string | null }> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
      include: {
        campaign: {
          include: {
            payoutProfile: true,
            organizer: {
              include: {
                payoutProfiles: { where: { isDefault: true }, take: 1 },
              },
            },
          },
        },
      },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (!payout.isManualAdjustment) {
      throw new BadRequestException('Not a manual adjustment payout');
    }
    if (payout.status !== PayoutStatus.PENDING_APPROVAL) {
      throw new BadRequestException(`Payout status is ${payout.status}`);
    }
    if (payout.requestedByUserId === approvedByUserId) {
      throw new ForbiddenException(
        'Requester cannot approve their own manual adjustment',
      );
    }

    const profile =
      payout.campaign.payoutProfile ??
      payout.campaign.organizer.payoutProfiles?.[0];
    if (!profile) {
      throw new BadRequestException('No payout profile for campaign');
    }

    const amount = Number(payout.amount);
    const currency = payout.currency;

    // Resolve recipient and call Paystack BEFORE writing to the ledger.
    // If the transfer fails we must NOT debit the ledger — the payout remains
    // PENDING_APPROVAL so an admin can investigate and retry.
    const recipientCode = await this.resolveRecipient(profile.id);
    // Stable key: no Date.now() so Paystack can deduplicate on retry.
    const idempotencyKey = `manual-${payoutId}`;
    const result = await this.initiateTransfer(
      recipientCode,
      amount,
      currency,
      `Manual adjustment ${payout.campaignId}`,
      idempotencyKey,
    );

    // Transfer succeeded — atomically debit ledger and mark payout INITIATED.
    await this.prisma.$transaction(async (tx) => {
      await this.campaignLedger.createManualAdjustment(
        payout.campaignId,
        payoutId,
        amount,
        currency,
        { approvalReason, approvedByUserId },
        tx,
      );
      await tx.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.INITIATED,
          providerRef: result.reference,
          idempotencyKey,
          approvedByUserId,
          approvalReason: approvalReason ?? null,
          snapshotRecipientCode: recipientCode,
        },
      });
    });

    await this.audit.log({
      eventName: 'admin.payout.manual_adjustment.approved',
      action: AuditAction.APPROVE,
      entityType: 'Payout',
      entityId: payoutId,
      actorUserId: approvedByUserId,
      before: { status: payout.status },
      after: { status: PayoutStatus.INITIATED, approvalReason },
      note: 'Manual adjustment approved and executed',
    });
    this.observability.recordPayout({ outcome: 'success' });

    return {
      id: payoutId,
      status: PayoutStatus.INITIATED,
      providerRef: result.reference,
    };
  }
}
