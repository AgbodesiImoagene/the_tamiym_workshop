import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignLedgerService } from '../payouts/campaign-ledger.service';
import { DEFAULT_CURRENCY } from '../constants';

export interface AnalyticsOverviewDto {
  ordersCount: number;
  ordersPaidCount: number;
  totalRevenue: number;
  currency: string;
  campaignsCount: number;
  campaignsActiveCount: number;
  dateFrom?: Date;
  dateTo?: Date;
}

export interface PayoutOverviewDto {
  payoutRunsTotal: number;
  payoutRunsPendingApproval: number;
  payoutRunsCompleted: number;
  payoutsFailed: number;
  payoutsSucceeded: number;
}

/**
 * Admin money-truth snapshot. Field semantics are documented for ops/audit.
 */
export interface MoneyMetricsDto extends PayoutOverviewDto {
  /** Count of payout runs per PayoutRunStatus */
  payoutRunsByStatus: Record<string, number>;
  /** Count of payouts per PayoutStatus */
  payoutsByStatus: Record<string, number>;
  /** Sum of payout.amount for payouts that reached SUCCEEDED */
  payoutsSucceededAmount: number;
  /** Manual adjustments awaiting a second admin (PENDING_APPROVAL) */
  manualAdjustmentsPendingApproval: number;
  /**
   * Sum of Campaign.currentAmount (webhook cache of paid campaign-order totals).
   * Not the same as ledger-eligible balance.
   */
  campaignsGrossRaisedSum: number;
  /**
   * Sum of all ledger entry amounts where availableAt <= now (platform-wide).
   * Per-campaign this equals eligible payout; summed across campaigns = net position.
   */
  ledgerEligibleTotal: number;
  /** Transfers not yet terminal (QUEUED, PROCESSING, INITIATED) */
  payoutsInFlight: number;
  payoutsReversed: number;
  currency: string;
}

export interface CampaignFundraisingSnapshotDto {
  campaignId: string;
  title: string;
  slug: string;
  status: string;
  currency: string;
  goalAmount: number | null;
  /** Webhook-updated cache (gross inflow for campaign orders) */
  currentAmountGross: number;
  /** Ledger-based eligible balance for payout (holds, refunds, reserves applied) */
  eligibleBalanceLedger: number;
  paidOrdersCount: number;
  paidOrdersTotal: number;
  lastPayout: {
    id: string;
    amount: number;
    status: string;
    createdAt: Date;
    providerRef: string | null;
    isManualAdjustment: boolean;
    payoutRunId: string | null;
  } | null;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private campaignLedger: CampaignLedgerService,
  ) {}

  /**
   * Get overview metrics (orders count, revenue, campaigns). Admin-only.
   */
  async getOverview(
    dateFrom?: Date,
    dateTo?: Date,
  ): Promise<AnalyticsOverviewDto> {
    const dateFilter =
      dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom && { gte: dateFrom }),
              ...(dateTo && { lte: dateTo }),
            },
          }
        : {};

    const [
      ordersCount,
      ordersPaid,
      revenueResult,
      campaignsCount,
      campaignsActive,
    ] = await Promise.all([
      this.prisma.order.count({ where: dateFilter }),
      this.prisma.order.count({
        where: { ...dateFilter, status: 'PAID' },
      }),
      this.prisma.order.aggregate({
        where: { ...dateFilter, status: 'PAID' },
        _sum: { totalAmount: true },
      }),
      this.prisma.campaign.count({ where: dateFilter }),
      // Count campaigns that were (or still are) ACTIVE at any point within
      // the date window, not just those created in that window.
      this.prisma.campaign.count({
        where: {
          status: 'ACTIVE',
          ...(dateFrom || dateTo
            ? {
                AND: [
                  ...(dateTo ? [{ createdAt: { lte: dateTo } }] : []),
                  ...(dateFrom
                    ? [
                        {
                          OR: [
                            { endDate: null },
                            { endDate: { gte: dateFrom } },
                          ],
                        },
                      ]
                    : []),
                ],
              }
            : {}),
        },
      }),
    ]);

    const totalRevenue = Number(revenueResult._sum.totalAmount ?? 0);

    return {
      ordersCount,
      ordersPaidCount: ordersPaid,
      totalRevenue,
      currency: DEFAULT_CURRENCY,
      campaignsCount,
      campaignsActiveCount: campaignsActive,
      dateFrom: dateFrom ?? undefined,
      dateTo: dateTo ?? undefined,
    };
  }

  /**
   * Export orders as CSV (admin-only). Optional date range.
   */
  async exportOrdersCsv(dateFrom?: Date, dateTo?: Date): Promise<string> {
    const where =
      dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom && { gte: dateFrom }),
              ...(dateTo && { lte: dateTo }),
            },
          }
        : {};

    const orders = await this.prisma.order.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        user: { select: { email: true, firstName: true, lastName: true } },
        items: {
          include: {
            product: { select: { name: true } },
            variant: { select: { sku: true } },
          },
        },
      },
    });

    const headers = [
      'id',
      'userId',
      'email',
      'firstName',
      'lastName',
      'status',
      'paymentStatus',
      'totalAmount',
      'currency',
      'createdAt',
    ];
    const rows = orders.map((o) => [
      o.id,
      o.userId,
      o.user?.email ?? '',
      o.user?.firstName ?? '',
      o.user?.lastName ?? '',
      o.status,
      o.paymentStatus,
      o.totalAmount.toString(),
      o.currency,
      o.createdAt.toISOString(),
    ]);

    const escape = (v: string) => {
      // Strip leading formula-injection characters (=, +, -, @) that Excel evaluates
      const safe = v.replace(/^[=+\-@\t\r]+/, '');
      return safe.includes(',') || safe.includes('"') || safe.includes('\n')
        ? `"${safe.replace(/"/g, '""')}"`
        : safe;
    };
    const csv =
      headers.join(',') +
      '\n' +
      rows.map((r) => r.map((c) => escape(String(c))).join(',')).join('\n');
    return csv;
  }

  /**
   * Export campaigns as CSV (admin-only). Optional date range.
   */
  async exportCampaignsCsv(dateFrom?: Date, dateTo?: Date): Promise<string> {
    const where =
      dateFrom || dateTo
        ? {
            createdAt: {
              ...(dateFrom && { gte: dateFrom }),
              ...(dateTo && { lte: dateTo }),
            },
          }
        : {};

    const campaigns = await this.prisma.campaign.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        organizer: { select: { email: true, firstName: true, lastName: true } },
      },
    });

    const headers = [
      'id',
      'organizerId',
      'organizerEmail',
      'organizerFirstName',
      'organizerLastName',
      'title',
      'slug',
      'status',
      'goalAmount',
      'currentAmount',
      'currency',
      'createdAt',
    ];
    const rows = campaigns.map((c) => [
      c.id,
      c.organizerId,
      c.organizer?.email ?? '',
      c.organizer?.firstName ?? '',
      c.organizer?.lastName ?? '',
      c.title,
      c.slug,
      c.status,
      c.goalAmount?.toString() ?? '',
      c.currentAmount.toString(),
      c.currency,
      c.createdAt.toISOString(),
    ]);

    const escape = (v: string) => {
      const safe = v.replace(/^[=+\-@\t\r]+/, '');
      return safe.includes(',') || safe.includes('"') || safe.includes('\n')
        ? `"${safe.replace(/"/g, '""')}"`
        : safe;
    };
    const csv =
      headers.join(',') +
      '\n' +
      rows.map((r) => r.map((c) => escape(String(c))).join(',')).join('\n');
    return csv;
  }

  /**
   * Get payout metrics (runs, failed/succeeded payouts). Admin-only.
   * Prefer getMoneyMetrics for the full snapshot.
   */
  async getPayoutOverview(): Promise<PayoutOverviewDto> {
    const m = await this.getMoneyMetrics();
    return {
      payoutRunsTotal: m.payoutRunsTotal,
      payoutRunsPendingApproval: m.payoutRunsPendingApproval,
      payoutRunsCompleted: m.payoutRunsCompleted,
      payoutsFailed: m.payoutsFailed,
      payoutsSucceeded: m.payoutsSucceeded,
    };
  }

  /**
   * Consolidated admin money metrics: payout pipeline, gross vs ledger, manual-adjustment backlog.
   */
  async getMoneyMetrics(): Promise<MoneyMetricsDto> {
    const now = new Date();
    const [
      payoutRunsTotal,
      payoutRunsPendingApproval,
      payoutRunsCompleted,
      payoutsFailed,
      payoutsSucceeded,
      payoutsSucceededAmountAgg,
      manualAdjustmentsPendingApproval,
      payoutsInFlight,
      payoutsReversed,
      grossAgg,
      ledgerAgg,
      runsByStatus,
      payoutsByStatus,
    ] = await Promise.all([
      this.prisma.payoutRun.count(),
      this.prisma.payoutRun.count({
        where: { status: { in: ['DRAFT', 'PENDING_APPROVAL'] } },
      }),
      this.prisma.payoutRun.count({ where: { status: 'COMPLETED' } }),
      this.prisma.payout.count({ where: { status: 'FAILED' } }),
      this.prisma.payout.count({ where: { status: 'SUCCEEDED' } }),
      this.prisma.payout.aggregate({
        where: { status: 'SUCCEEDED' },
        _sum: { amount: true },
      }),
      this.prisma.payout.count({
        where: {
          isManualAdjustment: true,
          status: 'PENDING_APPROVAL',
        },
      }),
      this.prisma.payout.count({
        where: {
          status: { in: ['QUEUED', 'PROCESSING', 'INITIATED'] },
        },
      }),
      this.prisma.payout.count({ where: { status: 'REVERSED' } }),
      this.prisma.campaign.aggregate({ _sum: { currentAmount: true } }),
      this.prisma.campaignBalanceLedgerEntry.aggregate({
        where: { availableAt: { lte: now } },
        _sum: { amount: true },
      }),
      this.prisma.payoutRun.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.payout.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
    ]);

    const payoutRunsByStatus = Object.fromEntries(
      runsByStatus.map((r) => [r.status, r._count._all]),
    );
    const payoutsByStatusMap = Object.fromEntries(
      payoutsByStatus.map((r) => [r.status, r._count._all]),
    );

    return {
      payoutRunsTotal,
      payoutRunsPendingApproval,
      payoutRunsCompleted,
      payoutsFailed,
      payoutsSucceeded,
      payoutsSucceededAmount: Number(
        payoutsSucceededAmountAgg._sum.amount ?? 0,
      ),
      payoutRunsByStatus,
      payoutsByStatus: payoutsByStatusMap,
      manualAdjustmentsPendingApproval,
      campaignsGrossRaisedSum: Number(grossAgg._sum.currentAmount ?? 0),
      ledgerEligibleTotal: Number(ledgerAgg._sum.amount ?? 0),
      payoutsInFlight,
      payoutsReversed,
      currency: DEFAULT_CURRENCY,
    };
  }

  /**
   * Per-campaign fundraising snapshot for admin (goal, gross cache, ledger eligible, orders, last payout).
   */
  async getCampaignFundraisingSnapshot(
    campaignId: string,
  ): Promise<CampaignFundraisingSnapshotDto> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        title: true,
        slug: true,
        status: true,
        currency: true,
        goalAmount: true,
        currentAmount: true,
      },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    const [eligibleBalanceLedger, paidAgg, lastPayout] = await Promise.all([
      this.campaignLedger.getEligibleBalance(campaignId),
      this.prisma.order.aggregate({
        where: {
          campaignId,
          status: 'PAID',
        },
        _count: { _all: true },
        _sum: { totalAmount: true },
      }),
      this.prisma.payout.findFirst({
        where: { campaignId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          amount: true,
          status: true,
          createdAt: true,
          providerRef: true,
          isManualAdjustment: true,
          payoutRunId: true,
        },
      }),
    ]);

    return {
      campaignId: campaign.id,
      title: campaign.title,
      slug: campaign.slug,
      status: campaign.status,
      currency: campaign.currency,
      goalAmount:
        campaign.goalAmount != null ? Number(campaign.goalAmount) : null,
      currentAmountGross: Number(campaign.currentAmount),
      eligibleBalanceLedger,
      paidOrdersCount: paidAgg._count._all,
      paidOrdersTotal: Number(paidAgg._sum.totalAmount ?? 0),
      lastPayout: lastPayout
        ? {
            id: lastPayout.id,
            amount: Number(lastPayout.amount),
            status: lastPayout.status,
            createdAt: lastPayout.createdAt,
            providerRef: lastPayout.providerRef,
            isManualAdjustment: lastPayout.isManualAdjustment,
            payoutRunId: lastPayout.payoutRunId,
          }
        : null,
    };
  }
}
