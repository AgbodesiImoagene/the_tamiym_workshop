import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
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
} from '../generated/prisma/enums';
import { DEFAULT_CURRENCY } from '../constants';
import { AuditAction } from '../generated/prisma/enums';
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

@Injectable()
export class PayoutsService {
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
        if (idempotencyKey) {
          headers['Idempotency-Key'] = idempotencyKey;
        }
        const res = await fetch('https://api.paystack.co/transfer', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            source: 'balance',
            amount: amountKobo,
            recipient: recipientCode,
            reason,
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
        const reference =
          data.data?.reference ?? data.data?.transfer_code ?? null;
        return { reference };
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

        const currency = (campaign.currency as 'NGN') ?? DEFAULT_CURRENCY;

        // Create the payout row in PROCESSING so it is visible before hitting Paystack.
        const payout = await this.prisma.payout.create({
          data: {
            campaignId,
            recipientUserId: campaign.organizerId,
            provider: PaymentProvider.PAYSTACK,
            status: PayoutStatus.PROCESSING,
            currency,
            amount,
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
          const recipientCode = await this.resolveRecipient(profile.id);
          const idempotencyKey = `payout-${payout.id}`;
          const result = await this.initiateTransfer(
            recipientCode,
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
              snapshotRecipientCode: recipientCode,
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
   * Update payout status by Paystack reference (called from webhook).
   * Optionally store raw webhook payload for reconciliation.
   * Returns updated payout(s) for ledger reconciliation.
   */
  async updatePayoutStatusByReference(
    reference: string,
    status: PayoutStatus,
    rawEvent?: object,
  ): Promise<
    { campaignId: string; id: string; amount: number; currency: string }[]
  > {
    const payouts = await this.prisma.payout.findMany({
      where: { providerRef: reference },
      include: {
        recipient: { select: { id: true, email: true, firstName: true } },
        campaign: { select: { id: true, title: true } },
      },
    });
    if (payouts.length === 0) return [];
    await this.prisma.payout.updateMany({
      where: { providerRef: reference },
      data: { status, ...(rawEvent && { rawEvent }) },
    });
    await Promise.all(
      payouts.map((payout) =>
        this.audit.log({
          eventName: 'webhook.payout.status_updated',
          action: AuditAction.PAYOUT,
          entityType: 'Payout',
          entityId: payout.id,
          outcome:
            status === PayoutStatus.FAILED
              ? AuditOutcome.FAILURE
              : AuditOutcome.SUCCESS,
          before: { status: payout.status },
          after: { status, providerRef: reference },
          metadata: rawEvent,
          note: 'Paystack transfer webhook updated payout status',
          source: AuditSource.WEBHOOK,
        }),
      ),
    );
    this.observability.recordPayout({
      outcome: status === PayoutStatus.FAILED ? 'failure' : 'success',
    });

    if (status === PayoutStatus.SUCCEEDED || status === PayoutStatus.FAILED) {
      for (const p of payouts) {
        const email = p.recipient?.email;
        if (!email) continue;
        const eventName =
          status === PayoutStatus.SUCCEEDED
            ? OUTBOX_EVENT_ORGANIZER_PAYOUT_SUCCEEDED
            : OUTBOX_EVENT_ORGANIZER_PAYOUT_FAILED;
        const notification = await this.prisma.notificationOutbox.create({
          data: {
            eventName,
            channel: NotificationChannel.EMAIL,
            recipient: email,
            recipientUserId: p.recipient.id,
            payload: {
              payoutId: p.id,
              amount: Number(p.amount),
              currency: p.currency,
              campaignTitle: p.campaign?.title ?? 'Your campaign',
              firstName: p.recipient.firstName,
              failureReason:
                status === PayoutStatus.FAILED
                  ? (p.failureReason ??
                    'The transfer did not complete. Check your payout profile in the app.')
                  : '',
            },
          },
        });
        await this.notificationOutboxDelivery.enqueueDelivery(notification.id);

        await this.adminNotify.emit(
          status === PayoutStatus.SUCCEEDED
            ? ADMIN_NOTIF_PAYOUT_SUCCEEDED
            : ADMIN_NOTIF_PAYOUT_FAILED,
          {
            payoutId: p.id,
            amount: Number(p.amount),
            currency: p.currency,
            campaignTitle: p.campaign?.title ?? '',
            recipientEmail: email,
            failureReason:
              status === PayoutStatus.FAILED
                ? (p.failureReason ??
                  'The transfer did not complete. Check your payout profile in the app.')
                : '',
          },
        );
      }
    }

    // After updating a terminal state, check whether the owning payout run
    // (if any) has all its payouts in terminal states and can be closed.
    const terminalStatuses: PayoutStatus[] = [
      PayoutStatus.SUCCEEDED,
      PayoutStatus.FAILED,
      PayoutStatus.REVERSED,
      PayoutStatus.CANCELLED,
    ];
    if (terminalStatuses.includes(status)) {
      const runIds = [
        ...new Set(payouts.map((p) => p.payoutRunId).filter(Boolean)),
      ] as string[];
      for (const runId of runIds) {
        const allInRun = await this.prisma.payout.findMany({
          where: { payoutRunId: runId },
          select: { status: true },
        });
        const allTerminal = allInRun.every((p) =>
          terminalStatuses.includes(p.status),
        );
        if (allTerminal) {
          await this.prisma.payoutRun.update({
            where: { id: runId },
            data: {
              status: PayoutRunStatus.COMPLETED,
              executedAt: new Date(),
            },
          });
        }
      }
    }

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
