import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CampaignLedgerService } from './campaign-ledger.service';
import { PayoutsService } from './payouts.service';
import {
  PayoutRunStatus,
  PayoutStatus,
  PayoutMode,
  AuditAction,
  OrganizerApplicationStatus,
} from '../generated/prisma/enums';
import { DEFAULT_CURRENCY } from '../constants';
import { ObservabilityService } from '../observability/observability.service';
import { isTerminalPayoutStatus } from './payout-transfer-transitions';
import {
  maskAccountNumber,
  PAYOUT_ELIGIBILITY_POLICY_VERSION,
  PayoutEligibilityGate,
  resolvePayoutBankResolutionMode,
  stubRecipientCodeForProfile,
} from './payout-eligibility';
import {
  assertPayoutEligible,
  assertAutoExecuteModeAllowed,
  evaluateForGate,
  loadPayoutEligibilityOrganiser,
  readAutoExecuteEnabled,
  snapshotFromResult,
  toEligibilityProfile,
} from './payout-eligibility.helpers';

export interface PayoutRunPreviewItem {
  campaignId: string;
  campaignTitle: string;
  organizerId: string;
  eligibleBalance: number;
  currency: string;
  payoutProfileId: string | null;
  /** Present when preview excludes a campaign for policy reasons. */
  denialCode?: string;
}

export interface PayoutRunPreviewResult {
  cutoffAt: Date;
  minimumPayoutAmount: number;
  policyVersion: string;
  items: PayoutRunPreviewItem[];
  totalAmount: number;
}

const PROFILE_SELECT = {
  id: true,
  userId: true,
  status: true,
  bankResolutionStatus: true,
  destinationVersion: true,
  bankCode: true,
  accountName: true,
  accountNumber: true,
  recipientCode: true,
} as const;

@Injectable()
export class PayoutRunsService {
  constructor(
    private prisma: PrismaService,
    private campaignLedger: CampaignLedgerService,
    private payoutsService: PayoutsService,
    private audit: AuditService,
    private observability: ObservabilityService,
    private config: ConfigService,
  ) {}

  /** Resolve effective payout mode for a campaign (site default or campaign override). */
  async getEffectivePayoutMode(campaignId: string): Promise<PayoutMode> {
    const [site, campaign] = await Promise.all([
      this.prisma.siteSettings.findUnique({ where: { id: 'default' } }),
      this.prisma.campaign.findUnique({
        where: { id: campaignId },
        select: { payoutModeOverride: true },
      }),
    ]);
    return (
      campaign?.payoutModeOverride ?? site?.payoutMode ?? PayoutMode.MANUAL
    );
  }

  private assertAutoExecuteAllowed(mode: PayoutMode): void {
    assertAutoExecuteModeAllowed(mode, readAutoExecuteEnabled(this.config));
  }

  /**
   * Bind a transfer recipient onto the payout snapshot at create time.
   * Execute must never call resolveRecipient(profileId) — bank edits must not redirect.
   */
  private async recipientCodeForSnapshot(profile: {
    id: string;
    recipientCode: string | null;
    destinationVersion: number;
  }): Promise<string> {
    if (profile.recipientCode) {
      return profile.recipientCode;
    }
    const mode = resolvePayoutBankResolutionMode(
      this.config.get<string>('PAYOUT_BANK_RESOLUTION_MODE'),
      this.config.get<string>('NODE_ENV') ?? process.env.NODE_ENV,
    );
    if (mode === 'stub') {
      return stubRecipientCodeForProfile(
        profile.id,
        profile.destinationVersion,
      );
    }
    return this.payoutsService.resolveRecipient(profile.id);
  }

  /**
   * Preview which campaigns have eligible balance for a payout run at a given cutoff.
   */
  async previewPayoutRun(cutoffAt?: Date): Promise<PayoutRunPreviewResult> {
    const asOf = cutoffAt ?? new Date();
    const site = await this.prisma.siteSettings.findUnique({
      where: { id: 'default' },
    });
    const minimumPayoutAmount =
      site?.minimumPayoutAmount != null ? Number(site.minimumPayoutAmount) : 0;

    const campaigns = await this.prisma.campaign.findMany({
      where: {
        status: 'ACTIVE',
        OR: [
          { payoutProfileId: { not: null } },
          { organizer: { payoutProfiles: { some: { isDefault: true } } } },
        ],
      },
      include: {
        organizer: {
          select: {
            id: true,
            role: true,
            status: true,
            emailVerifiedAt: true,
            phone: true,
            organizerApplications: {
              where: { status: OrganizerApplicationStatus.APPROVED },
              orderBy: { reviewedAt: 'desc' },
              take: 1,
              select: { termsVersion: true },
            },
            payoutProfiles: {
              where: { isDefault: true },
              take: 1,
              select: PROFILE_SELECT,
            },
          },
        },
        payoutProfile: { select: PROFILE_SELECT },
      },
    });

    const balances = await this.campaignLedger.getEligibleBalancesByCampaign(
      campaigns.map((c) => c.id),
      asOf,
    );

    const items: PayoutRunPreviewItem[] = [];
    let totalAmount = 0;
    for (const c of campaigns) {
      const balance = balances.get(c.id) ?? 0;
      if (balance < minimumPayoutAmount) continue;
      const profile =
        c.payoutProfile ?? c.organizer.payoutProfiles?.[0] ?? null;
      const eligibility = evaluateForGate({
        gate: PayoutEligibilityGate.PREVIEW,
        organiser: {
          id: c.organizer.id,
          role: c.organizer.role,
          status: c.organizer.status,
          emailVerifiedAt: c.organizer.emailVerifiedAt,
          phone: c.organizer.phone,
          termsVersion:
            c.organizer.organizerApplications[0]?.termsVersion ?? null,
        },
        profile: profile ? toEligibilityProfile(profile) : null,
      });
      if (!eligibility.eligible || !profile) continue;
      items.push({
        campaignId: c.id,
        campaignTitle: c.title,
        organizerId: c.organizerId,
        eligibleBalance: balance,
        currency: (c.currency as string) ?? DEFAULT_CURRENCY,
        payoutProfileId: profile.id,
      });
      totalAmount += balance;
    }

    return {
      cutoffAt: asOf,
      minimumPayoutAmount,
      policyVersion: PAYOUT_ELIGIBILITY_POLICY_VERSION,
      items,
      totalAmount,
    };
  }

  /**
   * Create a payout run (DRAFT) with one payout per campaign from preview.
   * Campaigns whose effective payout mode is MANUAL are excluded unless the
   * requested run mode is itself MANUAL (explicit admin-manual run).
   * Does not reserve ledger or call Paystack.
   */
  async createPayoutRun(
    scheduledFor: Date,
    cutoffAt: Date,
    mode: PayoutMode,
    requestedByUserId: string,
  ): Promise<{ id: string; status: string; payoutCount: number }> {
    this.assertAutoExecuteAllowed(mode);
    const preview = await this.previewPayoutRun(cutoffAt);

    const eligibleItems =
      mode === PayoutMode.MANUAL
        ? preview.items
        : await Promise.all(
            preview.items.map(async (item) => {
              const effectiveMode = await this.getEffectivePayoutMode(
                item.campaignId,
              );
              return effectiveMode !== PayoutMode.MANUAL ? item : null;
            }),
          ).then((results) => results.filter(Boolean) as typeof preview.items);

    if (eligibleItems.length === 0) {
      throw new BadRequestException(
        'No campaigns with eligible balance meet minimum payout amount',
      );
    }

    // Freeze the full destination tuple outside the create transaction so
    // bank edits cannot desync recipient vs mask/name/version, and Paystack
    // is not called under a long DB lock.
    type FrozenDestination = {
      profileId: string;
      bankCode: string;
      accountName: string;
      accountNumber: string;
      destinationVersion: number;
      recipientCode: string;
    };
    const frozenByCampaignId = new Map<string, FrozenDestination>();
    for (const item of eligibleItems) {
      const campaign = await this.prisma.campaign.findUnique({
        where: { id: item.campaignId },
        include: {
          payoutProfile: { select: PROFILE_SELECT },
          organizer: {
            select: {
              payoutProfiles: {
                where: { isDefault: true },
                take: 1,
                select: PROFILE_SELECT,
              },
            },
          },
        },
      });
      const profile =
        campaign?.payoutProfile ?? campaign?.organizer.payoutProfiles?.[0];
      if (!profile) {
        throw new BadRequestException(
          `Campaign ${item.campaignId} is missing a payout profile at run create`,
        );
      }
      const recipientCode = await this.recipientCodeForSnapshot(profile);
      if (!recipientCode) {
        throw new BadRequestException(
          `Campaign ${item.campaignId} could not snapshot a transfer recipient`,
        );
      }
      frozenByCampaignId.set(item.campaignId, {
        profileId: profile.id,
        bankCode: profile.bankCode,
        accountName: profile.accountName,
        accountNumber: profile.accountNumber,
        destinationVersion: profile.destinationVersion,
        recipientCode,
      });
    }

    const run = await this.prisma.$transaction(async (tx) => {
      const runRow = await tx.payoutRun.create({
        data: {
          scheduledFor,
          cutoffAt,
          mode,
          status: PayoutRunStatus.DRAFT,
          requestedByUserId,
          policyVersion: PAYOUT_ELIGIBILITY_POLICY_VERSION,
        },
      });

      for (const item of eligibleItems) {
        const frozen = frozenByCampaignId.get(item.campaignId);
        if (!frozen) {
          throw new BadRequestException(
            `Campaign ${item.campaignId} is missing a frozen payout destination`,
          );
        }

        const campaign = await tx.campaign.findUnique({
          where: { id: item.campaignId },
          include: {
            payoutProfile: { select: PROFILE_SELECT },
            organizer: {
              select: {
                id: true,
                role: true,
                status: true,
                emailVerifiedAt: true,
                phone: true,
                organizerApplications: {
                  where: { status: OrganizerApplicationStatus.APPROVED },
                  orderBy: { reviewedAt: 'desc' },
                  take: 1,
                  select: { termsVersion: true },
                },
                payoutProfiles: {
                  where: { isDefault: true },
                  take: 1,
                  select: PROFILE_SELECT,
                },
              },
            },
          },
        });
        if (!campaign) {
          throw new BadRequestException(
            `Campaign ${item.campaignId} disappeared during payout run create`,
          );
        }
        const profile =
          campaign.payoutProfile ?? campaign.organizer.payoutProfiles?.[0];
        if (!profile || profile.id !== frozen.profileId) {
          throw new BadRequestException(
            `Campaign ${item.campaignId} payout destination changed during run create`,
          );
        }

        const eligibility = evaluateForGate({
          gate: PayoutEligibilityGate.RUN_CREATE,
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
        if (!eligibility.eligible) {
          throw new BadRequestException({
            message: 'Campaign became ineligible during payout run create',
            code: eligibility.codes[0],
            campaignId: item.campaignId,
            policyVersion: eligibility.policyVersion,
          });
        }

        await tx.payout.create({
          data: {
            campaignId: item.campaignId,
            payoutRunId: runRow.id,
            recipientUserId: item.organizerId,
            status: PayoutStatus.DRAFT,
            currency: item.currency as 'NGN',
            amount: item.eligibleBalance,
            snapshotBankCode: frozen.bankCode,
            snapshotAccountName: frozen.accountName,
            snapshotAccountMask: maskAccountNumber(frozen.accountNumber),
            snapshotRecipientCode: frozen.recipientCode,
            snapshotProfileId: frozen.profileId,
            snapshotDestinationVersion: frozen.destinationVersion,
            policyVersion: PAYOUT_ELIGIBILITY_POLICY_VERSION,
            eligibilitySnapshot: snapshotFromResult(
              eligibility,
              item.organizerId,
            ),
          },
        });
      }

      return runRow;
      return runRow;
    });

    const count = await this.prisma.payout.count({
      where: { payoutRunId: run.id },
    });

    if (count === 0) {
      await this.prisma.payoutRun.update({
        where: { id: run.id },
        data: { status: PayoutRunStatus.CANCELLED },
      });
      throw new BadRequestException(
        'No campaigns remained eligible after payout policy evaluation',
      );
    }

    await this.audit.log({
      eventName: 'admin.payout-run.created',
      action: AuditAction.CREATE,
      entityType: 'PayoutRun',
      entityId: run.id,
      actorUserId: requestedByUserId,
      after: { status: run.status, payoutCount: count },
      note: 'Payout run created',
    });
    this.observability.recordPayoutRun({ outcome: 'success' });

    return {
      id: run.id,
      status: run.status,
      payoutCount: count,
    };
  }

  /**
   * Approve a payout run (DRAFT -> APPROVED). Payouts move to QUEUED.
   */
  async approvePayoutRun(
    runId: string,
    approvedByUserId: string,
  ): Promise<{ id: string; status: string }> {
    const run = await this.prisma.payoutRun.findUnique({
      where: { id: runId },
      include: { payouts: true },
    });
    if (!run) throw new NotFoundException('Payout run not found');
    if (
      run.status !== PayoutRunStatus.DRAFT &&
      run.status !== PayoutRunStatus.PENDING_APPROVAL
    ) {
      throw new BadRequestException(
        `Payout run cannot be approved (current status: ${run.status})`,
      );
    }

    this.assertAutoExecuteAllowed(run.mode);

    for (const payout of run.payouts) {
      const organiser = await loadPayoutEligibilityOrganiser(
        this.prisma,
        payout.recipientUserId,
      );
      if (!organiser) {
        throw new BadRequestException({
          message: 'Payout recipient not found',
          code: 'PAYOUT_ORGANISER_NOT_ACTIVE',
        });
      }
      const profileId = payout.snapshotProfileId;
      const profile = profileId
        ? await this.prisma.userPayoutProfile.findUnique({
            where: { id: profileId },
            select: PROFILE_SELECT,
          })
        : null;
      const eligibility = evaluateForGate({
        gate: PayoutEligibilityGate.RUN_APPROVE,
        organiser,
        profile: profile ? toEligibilityProfile(profile) : null,
      });
      assertPayoutEligible(eligibility);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.payoutRun.update({
        where: { id: runId },
        data: {
          status: PayoutRunStatus.APPROVED,
          approvedByUserId,
          approvedAt: new Date(),
        },
      });
      await tx.payout.updateMany({
        where: { payoutRunId: runId },
        data: { status: PayoutStatus.QUEUED },
      });
    });

    await this.audit.log({
      eventName: 'admin.payout-run.approved',
      action: AuditAction.APPROVE,
      entityType: 'PayoutRun',
      entityId: runId,
      actorUserId: approvedByUserId,
      before: { status: run.status },
      after: { status: PayoutRunStatus.APPROVED },
      note: 'Payout run approved',
    });
    this.observability.recordPayoutRun({ outcome: 'success' });

    return { id: runId, status: PayoutRunStatus.APPROVED };
  }

  /**
   * Execute a payout run: for each QUEUED payout, reserve ledger, call Paystack, update status.
   */
  async executePayoutRun(
    runId: string,
  ): Promise<{ id: string; status: string; processed: number }> {
    return this.observability.startSpan(
      'payout-runs.execute',
      { 'payout.run_id': runId },
      async () => {
        const run = await this.prisma.payoutRun.findUnique({
          where: { id: runId },
          include: { payouts: true },
        });
        if (!run) throw new NotFoundException('Payout run not found');
        if (run.status !== PayoutRunStatus.APPROVED) {
          throw new BadRequestException(
            `Payout run must be APPROVED to execute (current: ${run.status})`,
          );
        }

        const queued = run.payouts.filter(
          (p) => p.status === PayoutStatus.QUEUED,
        );
        let processed = 0;

        await this.prisma.payoutRun.update({
          where: { id: runId },
          data: { status: PayoutRunStatus.EXECUTING },
        });

        for (const payout of queued) {
          try {
            await this.executeSinglePayout(payout.id);
            processed++;
          } catch (err) {
            await this.prisma.payout.update({
              where: { id: payout.id },
              data: {
                status: PayoutStatus.FAILED,
                failureReason: err instanceof Error ? err.message : String(err),
              },
            });
          }
        }

        const allPayouts = await this.prisma.payout.findMany({
          where: { payoutRunId: runId },
        });
        const allTerminalNow = allPayouts.every(
          (p) =>
            p.status === PayoutStatus.SUCCEEDED ||
            p.status === PayoutStatus.FAILED ||
            p.status === PayoutStatus.REVERSED ||
            p.status === PayoutStatus.CANCELLED,
        );

        const newRunStatus = allTerminalNow
          ? PayoutRunStatus.COMPLETED
          : PayoutRunStatus.EXECUTING;

        await this.prisma.payoutRun.update({
          where: { id: runId },
          data: {
            status: newRunStatus,
            executedAt: allTerminalNow ? new Date() : undefined,
          },
        });
        this.observability.recordPayoutRun({
          outcome: allTerminalNow ? 'success' : 'failure',
        });

        return {
          id: runId,
          status: newRunStatus,
          processed,
        };
      },
    );
  }

  /**
   * Execute a single payout: reserve ledger, resolve recipient from snapshot, call Paystack.
   */
  async executeSinglePayout(payoutId: string): Promise<void> {
    const payout = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    if (!payout) throw new NotFoundException('Payout not found');
    if (
      payout.status !== PayoutStatus.QUEUED &&
      payout.status !== PayoutStatus.DRAFT
    ) {
      throw new BadRequestException(
        `Payout not queued (status: ${payout.status})`,
      );
    }

    const organiser = await loadPayoutEligibilityOrganiser(
      this.prisma,
      payout.recipientUserId,
    );
    if (!organiser) {
      throw new BadRequestException({
        message: 'Payout recipient not found',
        code: 'PAYOUT_ORGANISER_NOT_ACTIVE',
      });
    }

    const profileId = payout.snapshotProfileId;
    const profile = profileId
      ? await this.prisma.userPayoutProfile.findUnique({
          where: { id: profileId },
          select: PROFILE_SELECT,
        })
      : null;

    const eligibility = evaluateForGate({
      gate: PayoutEligibilityGate.PROVIDER_INITIATE,
      organiser,
      profile: profile ? toEligibilityProfile(profile) : null,
      // Destination is immutable on the payout row; only suspension/rejection block.
      allowNonVerifiedProfile: true,
    });
    assertPayoutEligible(eligibility);

    if (!payout.snapshotBankCode || !payout.snapshotAccountName) {
      throw new BadRequestException(
        'Payout is missing immutable destination snapshot',
      );
    }
    if (!payout.snapshotRecipientCode) {
      throw new BadRequestException(
        'Payout is missing snapshotted transfer recipient; refusing live profile resolution',
      );
    }

    const amount = Number(payout.amount);
    const currency = payout.currency;

    await this.prisma.payout.update({
      where: { id: payoutId },
      data: { status: PayoutStatus.PROCESSING },
    });

    await this.campaignLedger.createPayoutReserved(
      payout.campaignId,
      payoutId,
      amount,
      currency,
    );

    try {
      const recipientCode = payout.snapshotRecipientCode;
      const idempotencyKey = payout.idempotencyKey ?? `payout-${payoutId}`;

      const result = await this.payoutsService.initiateTransfer(
        recipientCode,
        amount,
        currency,
        `Campaign payout ${payout.campaignId}`,
        idempotencyKey,
      );

      await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.INITIATED,
          providerRef: result.reference,
          idempotencyKey,
          snapshotRecipientCode: recipientCode,
        },
      });
    } catch (err) {
      await this.campaignLedger.createPayoutFailed(
        payout.campaignId,
        payoutId,
        amount,
        currency,
        { error: err instanceof Error ? err.message : String(err) },
      );
      await this.prisma.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.FAILED,
          failureReason: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
  }

  /**
   * Retry a failed payout in a run by creating a **new** payout row and executing it.
   */
  async retryPayout(payoutId: string): Promise<{ id: string; status: string }> {
    const retry = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM "payouts" WHERE id = ${payoutId} FOR UPDATE
      `;
      const payout = await tx.payout.findUnique({
        where: { id: payoutId },
      });
      if (!payout) throw new NotFoundException('Payout not found');
      if (payout.status !== PayoutStatus.FAILED) {
        throw new BadRequestException('Only failed payouts can be retried');
      }
      if (!payout.payoutRunId) {
        throw new BadRequestException(
          'Only run payouts can be retried via this endpoint',
        );
      }

      const netLedger = await this.campaignLedger.getNetLedgerAmountForPayout(
        payoutId,
        tx,
      );
      if (netLedger < 0) {
        await this.campaignLedger.createPayoutFailed(
          payout.campaignId,
          payoutId,
          Math.abs(netLedger),
          payout.currency,
          { reason: 'Clearing stale reservation before retry' },
          tx,
        );
      }

      const created = await tx.payout.create({
        data: {
          campaignId: payout.campaignId,
          recipientUserId: payout.recipientUserId,
          payoutRunId: payout.payoutRunId,
          provider: payout.provider,
          status: PayoutStatus.QUEUED,
          currency: payout.currency,
          amount: payout.amount,
          snapshotBankCode: payout.snapshotBankCode,
          snapshotAccountName: payout.snapshotAccountName,
          snapshotAccountMask: payout.snapshotAccountMask,
          snapshotRecipientCode: payout.snapshotRecipientCode,
          snapshotProfileId: payout.snapshotProfileId,
          snapshotDestinationVersion: payout.snapshotDestinationVersion,
          policyVersion: payout.policyVersion,
          eligibilitySnapshot: payout.eligibilitySnapshot ?? undefined,
          idempotencyKey:
            payout.providerRef == null
              ? (payout.idempotencyKey ?? `payout-${payout.id}`)
              : undefined,
        },
      });

      await tx.payout.update({
        where: { id: payoutId },
        data: {
          status: PayoutStatus.CANCELLED,
          failureReason: `Superseded by retry payout ${created.id}`,
        },
      });

      await tx.$executeRaw`
        SELECT id FROM "payout_runs" WHERE id = ${payout.payoutRunId} FOR UPDATE
      `;
      await tx.payoutRun.update({
        where: { id: payout.payoutRunId },
        data: { status: PayoutRunStatus.EXECUTING, executedAt: null },
      });

      return created;
    });

    try {
      await this.executeSinglePayout(retry.id);
    } finally {
      if (retry.payoutRunId) {
        await this.markRunCompletedIfAllTerminal(retry.payoutRunId);
      }
    }
    const updated = await this.prisma.payout.findUnique({
      where: { id: retry.id },
    });
    return { id: retry.id, status: updated?.status ?? PayoutStatus.QUEUED };
  }

  private async markRunCompletedIfAllTerminal(runId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM "payout_runs" WHERE id = ${runId} FOR UPDATE
      `;
      const allInRun = await tx.payout.findMany({
        where: { payoutRunId: runId },
        select: { status: true },
      });
      if (
        allInRun.length > 0 &&
        allInRun.every((p) => isTerminalPayoutStatus(p.status))
      ) {
        await tx.payoutRun.update({
          where: { id: runId },
          data: {
            status: PayoutRunStatus.COMPLETED,
            executedAt: new Date(),
          },
        });
      }
    });
  }

  async listPayoutRuns(params: {
    status?: PayoutRunStatus;
    limit?: number;
    offset?: number;
  }): Promise<{ runs: unknown[]; total: number }> {
    const where = params.status ? { status: params.status } : {};
    const [runs, total] = await Promise.all([
      this.prisma.payoutRun.findMany({
        where,
        orderBy: { scheduledFor: 'desc' },
        take: params.limit ?? 50,
        skip: params.offset ?? 0,
        include: {
          payouts: {
            select: {
              id: true,
              campaignId: true,
              amount: true,
              status: true,
              providerRef: true,
            },
          },
        },
      }),
      this.prisma.payoutRun.count({ where }),
    ]);
    return {
      runs: runs.map((r) => ({
        ...r,
        scheduledFor: r.scheduledFor,
        cutoffAt: r.cutoffAt,
        approvedAt: r.approvedAt,
        executedAt: r.executedAt,
      })),
      total,
    };
  }
}
