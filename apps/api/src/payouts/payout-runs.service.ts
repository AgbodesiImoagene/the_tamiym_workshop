import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CampaignLedgerService } from './campaign-ledger.service';
import { PayoutsService } from './payouts.service';
import {
  PayoutRunStatus,
  PayoutStatus,
  PayoutMode,
  AuditAction,
} from '../generated/prisma/enums';
import { DEFAULT_CURRENCY } from '../constants';
import { ObservabilityService } from '../observability/observability.service';

export interface PayoutRunPreviewItem {
  campaignId: string;
  campaignTitle: string;
  organizerId: string;
  eligibleBalance: number;
  currency: string;
  payoutProfileId: string | null;
}

export interface PayoutRunPreviewResult {
  cutoffAt: Date;
  minimumPayoutAmount: number;
  items: PayoutRunPreviewItem[];
  totalAmount: number;
}

@Injectable()
export class PayoutRunsService {
  constructor(
    private prisma: PrismaService,
    private campaignLedger: CampaignLedgerService,
    private payoutsService: PayoutsService,
    private audit: AuditService,
    private observability: ObservabilityService,
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
          include: {
            payoutProfiles: { where: { isDefault: true }, take: 1 },
          },
        },
        payoutProfile: true,
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
      const profile = c.payoutProfile ?? c.organizer.payoutProfiles?.[0];
      if (!profile) continue;
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
    const preview = await this.previewPayoutRun(cutoffAt);

    // Filter preview items by effective payout mode.
    // A MANUAL-mode campaign should only be paid via direct admin initiation,
    // not via batch runs whose mode is AUTO or AUTO_WITH_APPROVAL.
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

    const run = await this.prisma.$transaction(async (tx) => {
      const runRow = await tx.payoutRun.create({
        data: {
          scheduledFor,
          cutoffAt,
          mode,
          status: PayoutRunStatus.DRAFT,
          requestedByUserId,
        },
      });

      for (const item of eligibleItems) {
        const campaign = await tx.campaign.findUnique({
          where: { id: item.campaignId },
          include: {
            payoutProfile: true,
            organizer: {
              include: {
                payoutProfiles: { where: { isDefault: true }, take: 1 },
              },
            },
          },
        });
        if (!campaign) continue;
        const profile =
          campaign.payoutProfile ?? campaign.organizer.payoutProfiles?.[0];
        if (!profile) continue;

        await tx.payout.create({
          data: {
            campaignId: item.campaignId,
            payoutRunId: runRow.id,
            recipientUserId: item.organizerId,
            status: PayoutStatus.DRAFT,
            currency: item.currency as 'NGN',
            amount: item.eligibleBalance,
            snapshotBankCode: profile.bankCode,
            snapshotAccountName: profile.accountName,
            snapshotAccountMask: profile.accountNumber
              ? `***${profile.accountNumber.slice(-4)}`
              : null,
            snapshotRecipientCode: profile.recipientCode,
          },
        });
      }

      return runRow;
    });

    const count = await this.prisma.payout.count({
      where: { payoutRunId: run.id },
    });

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

        // Mark the run EXECUTING — payouts that reached INITIATED are still
        // waiting for Paystack transfer webhooks.  The webhook handler in
        // PayoutsService.updatePayoutStatusByReference will flip the run to
        // COMPLETED once every payout reaches a terminal state.
        // Only move to COMPLETED immediately if every payout failed inline
        // (none are INITIATED / waiting for a webhook).
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
   * Execute a single payout: reserve ledger, resolve recipient, call Paystack, update payout.
   */
  async executeSinglePayout(payoutId: string): Promise<void> {
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
    if (
      payout.status !== PayoutStatus.QUEUED &&
      payout.status !== PayoutStatus.DRAFT
    ) {
      throw new BadRequestException(
        `Payout not queued (status: ${payout.status})`,
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
      const recipientCode = await this.payoutsService.resolveRecipient(
        profile.id,
      );
      const idempotencyKey = `payout-${payoutId}`;

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
   * Retry a failed payout in a run (re-queue and execute again).
   * If the previous attempt crashed after PAYOUT_RESERVED was written but
   * before PAYOUT_FAILED, the ledger carries a dangling debit.  We detect
   * this via the net ledger sum for the payoutId and create a PAYOUT_FAILED
   * entry to zero it out before re-queuing.
   */
  async retryPayout(payoutId: string): Promise<{ id: string; status: string }> {
    const payout = await this.prisma.payout.findUnique({
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

    // Repair any stale PAYOUT_RESERVED entry left by a mid-flight crash.
    const netLedger =
      await this.campaignLedger.getNetLedgerAmountForPayout(payoutId);
    if (netLedger < 0) {
      // Net negative = unreconciled reservation — cancel it so the retry
      // starts with a clean ledger position.
      await this.campaignLedger.createPayoutFailed(
        payout.campaignId,
        payoutId,
        Math.abs(netLedger),
        payout.currency,
        { reason: 'Clearing stale reservation before retry' },
      );
    }

    await this.prisma.payout.update({
      where: { id: payoutId },
      data: { status: PayoutStatus.QUEUED, failureReason: null },
    });

    await this.executeSinglePayout(payoutId);
    const updated = await this.prisma.payout.findUnique({
      where: { id: payoutId },
    });
    return { id: payoutId, status: updated?.status ?? PayoutStatus.QUEUED };
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
