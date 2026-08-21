import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignLedgerService } from '../payouts/campaign-ledger.service';
import { AuditService } from '../audit/audit.service';
import { DEFAULT_CURRENCY } from '../constants';
import {
  AuditAction,
  AuditSource,
  OrderStatus,
  ReconciliationFindingStatus,
  ReconciliationRunStatus,
} from '../generated/prisma/enums';
import {
  ANALYTICS_EXPORT_MAX_ROWS,
  ANALYTICS_KPI_POLICY_VERSION,
  AnalyticsExportEntity,
  AnalyticsQueryError,
  AnalyticsQueryErrorCode,
  AnalyticsResponseMeta,
  AppliedAnalyticsFilters,
  buildAnalyticsMeta,
  clampDrilldownTake,
  moneyNumber,
  parseExportEntity,
} from './analytics-contract';
import {
  PAID_LIFECYCLE_STATUSES,
  activeCampaignWhere,
  resolveAnalyticsQuery,
} from './analytics-filters';
import { escapeCsvCell } from '../reconciliation/reconciliation.util';
import type { AnalyticsQueryDto } from './dto/analytics-query.dto';

export interface AnalyticsOverviewDto {
  /** @deprecated Prefer metrics.settledRevenue — kept for admin client compat. */
  ordersCount: number;
  ordersPaidCount: number;
  /** Maps to catalogue settledRevenue (TTW-036). */
  totalRevenue: number;
  currency: string;
  campaignsCount: number;
  campaignsActiveCount: number;
  dateFrom?: string;
  dateTo?: string;
  meta: AnalyticsResponseMeta;
  metrics: {
    orderCount: number;
    orderPaidCount: number;
    grossOrderValue: number;
    settledRevenue: number;
    refundedValue: number;
    netRevenue: number;
    activeCampaignCount: number;
    campaignsCreatedCount: number;
  };
  definitions: {
    version: string;
    settledRevenue: string;
    grossOrderValue: string;
    netRevenue: string;
  };
}

export interface PayoutOverviewDto {
  payoutRunsTotal: number;
  payoutRunsPendingApproval: number;
  payoutRunsCompleted: number;
  payoutsFailed: number;
  payoutsSucceeded: number;
}

export interface MoneyMetricsDto extends PayoutOverviewDto {
  payoutRunsByStatus: Record<string, number>;
  payoutsByStatus: Record<string, number>;
  payoutsSucceededAmount: number;
  manualAdjustmentsPendingApproval: number;
  /** Gross cache — not ledger-eligible. */
  campaignsGrossRaisedSum: number;
  ledgerEligibleTotal: number;
  payoutsInFlight: number;
  payoutsReversed: number;
  currency: string;
  meta: AnalyticsResponseMeta;
  metrics: {
    campaignGrossRaised: number;
    eligibleLedgerBalance: number;
    paidOutValue: number;
  };
}

export interface CampaignFundraisingSnapshotDto {
  campaignId: string;
  title: string;
  slug: string;
  status: string;
  currency: string;
  goalAmount: number | null;
  currentAmountGross: number;
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
  meta: AnalyticsResponseMeta;
}

export interface DrilldownPage<T> {
  items: T[];
  nextCursor: string | null;
  meta: AnalyticsResponseMeta;
}

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private campaignLedger: CampaignLedgerService,
    private audit: AuditService,
  ) {}

  private async loadFreshnessAnchor(): Promise<Date | null> {
    const row = await this.prisma.reconciliationRun.findFirst({
      where: {
        status: ReconciliationRunStatus.COMPLETED,
        finishedAt: { not: null },
      },
      orderBy: { finishedAt: 'desc' },
      select: { finishedAt: true },
    });
    return row?.finishedAt ?? null;
  }

  private async metaFor(
    now: Date,
    filters: AppliedAnalyticsFilters,
  ): Promise<AnalyticsResponseMeta> {
    const last = await this.loadFreshnessAnchor();
    return buildAnalyticsMeta({
      now,
      currency: filters.currency || DEFAULT_CURRENCY,
      filters,
      lastReconciliationFinishedAt: last,
    });
  }

  private toBadRequest(err: unknown): never {
    if (err instanceof AnalyticsQueryError) {
      throw new BadRequestException({
        message: err.message,
        code: err.code,
      });
    }
    throw err;
  }

  /**
   * Overview metrics per TTW-036 catalogue. Admin-only.
   */
  async getOverview(
    query: AnalyticsQueryDto = {},
  ): Promise<AnalyticsOverviewDto> {
    try {
      const resolved = resolveAnalyticsQuery(query);
      const now = new Date();
      const paidWhere = {
        ...resolved.orderWhere,
        status: query.orderStatus
          ? query.orderStatus
          : { in: PAID_LIFECYCLE_STATUSES },
      };

      const [
        orderCount,
        orderPaidCount,
        grossAgg,
        settledAgg,
        refundedAgg,
        campaignsCreatedCount,
        activeCampaignCount,
        meta,
      ] = await Promise.all([
        this.prisma.order.count({ where: resolved.orderWhere }),
        this.prisma.order.count({ where: paidWhere }),
        this.prisma.order.aggregate({
          where: resolved.orderWhere,
          _sum: { totalAmount: true },
        }),
        this.prisma.payment.aggregate({
          where: resolved.paymentWhere,
          _sum: { amount: true },
        }),
        this.prisma.refund.aggregate({
          where: resolved.refundWhere,
          _sum: { amount: true },
        }),
        this.prisma.campaign.count({ where: resolved.campaignWhere }),
        this.prisma.campaign.count({
          where: activeCampaignWhere(resolved.window, {
            campaignId: resolved.filters.campaignId,
            currency: resolved.filters.currency,
          }),
        }),
        this.metaFor(now, resolved.filters),
      ]);

      const grossOrderValue = moneyNumber(grossAgg._sum.totalAmount);
      const settledRevenue = moneyNumber(settledAgg._sum.amount);
      const refundedValue = moneyNumber(refundedAgg._sum.amount);
      const netRevenue = settledRevenue - refundedValue;

      return {
        ordersCount: orderCount,
        ordersPaidCount: orderPaidCount,
        totalRevenue: settledRevenue,
        currency: resolved.filters.currency,
        campaignsCount: campaignsCreatedCount,
        campaignsActiveCount: activeCampaignCount,
        dateFrom: resolved.filters.dateFrom,
        dateTo: resolved.filters.dateTo,
        meta,
        metrics: {
          orderCount,
          orderPaidCount,
          grossOrderValue,
          settledRevenue,
          refundedValue,
          netRevenue,
          activeCampaignCount,
          campaignsCreatedCount,
        },
        definitions: {
          version: ANALYTICS_KPI_POLICY_VERSION,
          settledRevenue:
            'Sum of SUCCEEDED payments with settlement claim in window',
          grossOrderValue:
            'Sum of Order.totalAmount for non-DRAFT orders created in window',
          netRevenue: 'settledRevenue − refundedValue',
        },
      };
    } catch (err) {
      this.toBadRequest(err);
    }
  }

  async exportOrdersCsv(
    query: AnalyticsQueryDto = {},
    actorUserId?: string,
  ): Promise<string> {
    try {
      const resolved = resolveAnalyticsQuery(query);
      const count = await this.prisma.order.count({
        where: resolved.orderWhere,
      });
      if (count > ANALYTICS_EXPORT_MAX_ROWS) {
        throw new AnalyticsQueryError(
          AnalyticsQueryErrorCode.EXPORT_LIMIT_EXCEEDED,
          `Export would return ${count} rows; max is ${ANALYTICS_EXPORT_MAX_ROWS}`,
        );
      }

      const orders = await this.prisma.order.findMany({
        where: resolved.orderWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: ANALYTICS_EXPORT_MAX_ROWS,
        select: {
          id: true,
          userId: true,
          status: true,
          paymentStatus: true,
          totalAmount: true,
          currency: true,
          campaignId: true,
          createdAt: true,
          user: {
            select: { email: true, firstName: true, lastName: true },
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
        'campaignId',
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
        o.campaignId ?? '',
        o.createdAt.toISOString(),
      ]);

      const csv =
        headers.join(',') +
        '\n' +
        rows
          .map((r) => r.map((c) => escapeCsvCell(String(c))).join(','))
          .join('\n');

      await this.audit.log({
        eventName: 'admin.analytics.export',
        action: AuditAction.CREATE,
        entityType: 'AnalyticsExport',
        entityId: AnalyticsExportEntity.ORDERS,
        actorUserId: actorUserId ?? null,
        source: AuditSource.ADMIN_API,
        after: {
          entity: AnalyticsExportEntity.ORDERS,
          rowCount: orders.length,
          filters: resolved.filters,
          definitionVersion: ANALYTICS_KPI_POLICY_VERSION,
        },
      });

      return csv;
    } catch (err) {
      this.toBadRequest(err);
    }
  }

  async exportCampaignsCsv(
    query: AnalyticsQueryDto = {},
    actorUserId?: string,
  ): Promise<string> {
    try {
      const resolved = resolveAnalyticsQuery(query);
      const count = await this.prisma.campaign.count({
        where: resolved.campaignWhere,
      });
      if (count > ANALYTICS_EXPORT_MAX_ROWS) {
        throw new AnalyticsQueryError(
          AnalyticsQueryErrorCode.EXPORT_LIMIT_EXCEEDED,
          `Export would return ${count} rows; max is ${ANALYTICS_EXPORT_MAX_ROWS}`,
        );
      }

      const campaigns = await this.prisma.campaign.findMany({
        where: resolved.campaignWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: ANALYTICS_EXPORT_MAX_ROWS,
        select: {
          id: true,
          organizerId: true,
          title: true,
          slug: true,
          status: true,
          goalAmount: true,
          currentAmount: true,
          currency: true,
          createdAt: true,
          organizer: {
            select: { email: true, firstName: true, lastName: true },
          },
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

      const csv =
        headers.join(',') +
        '\n' +
        rows
          .map((r) => r.map((c) => escapeCsvCell(String(c))).join(','))
          .join('\n');

      await this.audit.log({
        eventName: 'admin.analytics.export',
        action: AuditAction.CREATE,
        entityType: 'AnalyticsExport',
        entityId: AnalyticsExportEntity.CAMPAIGNS,
        actorUserId: actorUserId ?? null,
        source: AuditSource.ADMIN_API,
        after: {
          entity: AnalyticsExportEntity.CAMPAIGNS,
          rowCount: campaigns.length,
          filters: resolved.filters,
          definitionVersion: ANALYTICS_KPI_POLICY_VERSION,
        },
      });

      return csv;
    } catch (err) {
      this.toBadRequest(err);
    }
  }

  async exportCsv(
    query: AnalyticsQueryDto,
    actorUserId?: string,
  ): Promise<{ entity: AnalyticsExportEntity; csv: string }> {
    try {
      const entity = parseExportEntity(query.entity);
      const csv =
        entity === AnalyticsExportEntity.CAMPAIGNS
          ? await this.exportCampaignsCsv(query, actorUserId)
          : await this.exportOrdersCsv(query, actorUserId);
      return { entity, csv };
    } catch (err) {
      this.toBadRequest(err);
    }
  }

  async getPayoutOverview(): Promise<PayoutOverviewDto> {
    const m = await this.getMoneyMetrics({});
    return {
      payoutRunsTotal: m.payoutRunsTotal,
      payoutRunsPendingApproval: m.payoutRunsPendingApproval,
      payoutRunsCompleted: m.payoutRunsCompleted,
      payoutsFailed: m.payoutsFailed,
      payoutsSucceeded: m.payoutsSucceeded,
    };
  }

  async getMoneyMetrics(
    query: AnalyticsQueryDto = {},
  ): Promise<MoneyMetricsDto> {
    try {
      const resolved = resolveAnalyticsQuery(query);
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
        meta,
      ] = await Promise.all([
        this.prisma.payoutRun.count(),
        this.prisma.payoutRun.count({
          where: { status: { in: ['DRAFT', 'PENDING_APPROVAL'] } },
        }),
        this.prisma.payoutRun.count({ where: { status: 'COMPLETED' } }),
        this.prisma.payout.count({ where: { status: 'FAILED' } }),
        this.prisma.payout.count({ where: { status: 'SUCCEEDED' } }),
        this.prisma.payout.aggregate({
          where: resolved.payoutWhere,
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
        this.prisma.campaign.aggregate({
          where: resolved.campaignWhere,
          _sum: { currentAmount: true },
        }),
        this.prisma.campaignBalanceLedgerEntry.aggregate({
          where: {
            availableAt: { lte: now },
            ...(query.campaignId ? { campaignId: query.campaignId } : {}),
            ...(resolved.filters.currency
              ? {
                  campaign: {
                    is: { currency: resolved.filters.currency },
                  },
                }
              : {}),
          },
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
        this.metaFor(now, resolved.filters),
      ]);

      const payoutRunsByStatus = Object.fromEntries(
        runsByStatus.map((r) => [r.status, r._count._all]),
      );
      const payoutsByStatusMap = Object.fromEntries(
        payoutsByStatus.map((r) => [r.status, r._count._all]),
      );
      const paidOutValue = moneyNumber(payoutsSucceededAmountAgg._sum.amount);
      const campaignGrossRaised = moneyNumber(grossAgg._sum.currentAmount);
      const eligibleLedgerBalance = moneyNumber(ledgerAgg._sum.amount);

      return {
        payoutRunsTotal,
        payoutRunsPendingApproval,
        payoutRunsCompleted,
        payoutsFailed,
        payoutsSucceeded,
        payoutsSucceededAmount: paidOutValue,
        payoutRunsByStatus,
        payoutsByStatus: payoutsByStatusMap,
        manualAdjustmentsPendingApproval,
        campaignsGrossRaisedSum: campaignGrossRaised,
        ledgerEligibleTotal: eligibleLedgerBalance,
        payoutsInFlight,
        payoutsReversed,
        currency: resolved.filters.currency,
        meta,
        metrics: {
          campaignGrossRaised,
          eligibleLedgerBalance,
          paidOutValue,
        },
      };
    } catch (err) {
      this.toBadRequest(err);
    }
  }

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

    const now = new Date();
    const [eligibleBalanceLedger, paidAgg, lastPayout, meta] =
      await Promise.all([
        this.campaignLedger.getEligibleBalance(campaignId),
        this.prisma.order.aggregate({
          where: {
            campaignId,
            status: { in: PAID_LIFECYCLE_STATUSES },
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
        this.metaFor(now, {
          currency: campaign.currency,
          campaignId,
        }),
      ]);

    return {
      campaignId: campaign.id,
      title: campaign.title,
      slug: campaign.slug,
      status: campaign.status,
      currency: campaign.currency,
      goalAmount:
        campaign.goalAmount != null ? moneyNumber(campaign.goalAmount) : null,
      currentAmountGross: moneyNumber(campaign.currentAmount),
      eligibleBalanceLedger,
      paidOrdersCount: paidAgg._count._all,
      paidOrdersTotal: moneyNumber(paidAgg._sum.totalAmount),
      lastPayout: lastPayout
        ? {
            id: lastPayout.id,
            amount: moneyNumber(lastPayout.amount),
            status: lastPayout.status,
            createdAt: lastPayout.createdAt,
            providerRef: lastPayout.providerRef,
            isManualAdjustment: lastPayout.isManualAdjustment,
            payoutRunId: lastPayout.payoutRunId,
          }
        : null,
      meta,
    };
  }

  async drilldownOrders(query: AnalyticsQueryDto = {}): Promise<
    DrilldownPage<{
      id: string;
      status: OrderStatus;
      paymentStatus: string;
      totalAmount: number;
      currency: string;
      campaignId: string | null;
      createdAt: Date;
    }>
  > {
    try {
      const resolved = resolveAnalyticsQuery(query);
      const take = clampDrilldownTake(query.take);
      const now = new Date();
      const rows = await this.prisma.order.findMany({
        where: resolved.orderWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          status: true,
          paymentStatus: true,
          totalAmount: true,
          currency: true,
          campaignId: true,
          createdAt: true,
        },
      });
      const hasMore = rows.length > take;
      const page = hasMore ? rows.slice(0, take) : rows;
      return {
        items: page.map((o) => ({
          id: o.id,
          status: o.status,
          paymentStatus: o.paymentStatus,
          totalAmount: moneyNumber(o.totalAmount),
          currency: o.currency,
          campaignId: o.campaignId,
          createdAt: o.createdAt,
        })),
        nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        meta: await this.metaFor(now, resolved.filters),
      };
    } catch (err) {
      this.toBadRequest(err);
    }
  }

  async drilldownSettlements(query: AnalyticsQueryDto = {}): Promise<
    DrilldownPage<{
      id: string;
      orderId: string;
      amount: number;
      currency: string;
      status: string;
      settledAt: Date | null;
      providerRef: string | null;
    }>
  > {
    try {
      const resolved = resolveAnalyticsQuery(query);
      const take = clampDrilldownTake(query.take);
      const now = new Date();
      const rows = await this.prisma.payment.findMany({
        where: resolved.paymentWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          orderId: true,
          amount: true,
          currency: true,
          status: true,
          providerRef: true,
          settlementClaim: { select: { createdAt: true } },
        },
      });
      const hasMore = rows.length > take;
      const page = hasMore ? rows.slice(0, take) : rows;
      return {
        items: page.map((p) => ({
          id: p.id,
          orderId: p.orderId,
          amount: moneyNumber(p.amount),
          currency: p.currency,
          status: p.status,
          settledAt: p.settlementClaim?.createdAt ?? null,
          providerRef: p.providerRef,
        })),
        nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        meta: await this.metaFor(now, resolved.filters),
      };
    } catch (err) {
      this.toBadRequest(err);
    }
  }

  async drilldownRefunds(query: AnalyticsQueryDto = {}): Promise<
    DrilldownPage<{
      id: string;
      orderId: string;
      amount: number;
      currency: string;
      status: string;
      settledAt: Date | null;
      providerRef: string | null;
    }>
  > {
    try {
      const resolved = resolveAnalyticsQuery(query);
      const take = clampDrilldownTake(query.take);
      const now = new Date();
      const rows = await this.prisma.refund.findMany({
        where: resolved.refundWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          orderId: true,
          amount: true,
          currency: true,
          status: true,
          providerRef: true,
          settlementClaim: { select: { createdAt: true } },
        },
      });
      const hasMore = rows.length > take;
      const page = hasMore ? rows.slice(0, take) : rows;
      return {
        items: page.map((r) => ({
          id: r.id,
          orderId: r.orderId,
          amount: moneyNumber(r.amount),
          currency: r.currency,
          status: r.status,
          settledAt: r.settlementClaim?.createdAt ?? null,
          providerRef: r.providerRef,
        })),
        nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        meta: await this.metaFor(now, resolved.filters),
      };
    } catch (err) {
      this.toBadRequest(err);
    }
  }

  async drilldownPayouts(query: AnalyticsQueryDto = {}): Promise<
    DrilldownPage<{
      id: string;
      campaignId: string;
      amount: number;
      currency: string;
      status: string;
      createdAt: Date;
      isManualAdjustment: boolean;
    }>
  > {
    try {
      const resolved = resolveAnalyticsQuery(query);
      const take = clampDrilldownTake(query.take);
      const now = new Date();
      // Drill-down shows succeeded paid-out rows under the same payoutWhere contract.
      const rows = await this.prisma.payout.findMany({
        where: resolved.payoutWhere,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          campaignId: true,
          amount: true,
          currency: true,
          status: true,
          createdAt: true,
          isManualAdjustment: true,
        },
      });
      const hasMore = rows.length > take;
      const page = hasMore ? rows.slice(0, take) : rows;
      return {
        items: page.map((p) => ({
          id: p.id,
          campaignId: p.campaignId,
          amount: moneyNumber(p.amount),
          currency: p.currency,
          status: p.status,
          createdAt: p.createdAt,
          isManualAdjustment: p.isManualAdjustment,
        })),
        nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        meta: await this.metaFor(now, resolved.filters),
      };
    } catch (err) {
      this.toBadRequest(err);
    }
  }

  async drilldownReconciliation(query: AnalyticsQueryDto = {}): Promise<
    DrilldownPage<{
      id: string;
      runId: string;
      domain: string;
      outcome: string;
      severity: string;
      status: string;
      fingerprint: string;
      leftLabel: string;
      leftValue: string;
      rightLabel: string;
      rightValue: string;
      currency: string | null;
      createdAt: Date;
    }>
  > {
    try {
      const resolved = resolveAnalyticsQuery(query);
      const take = clampDrilldownTake(query.take);
      const now = new Date();
      const createdAt =
        resolved.window.fromInclusive || resolved.window.toExclusive
          ? {
              ...(resolved.window.fromInclusive
                ? { gte: resolved.window.fromInclusive }
                : {}),
              ...(resolved.window.toExclusive
                ? { lt: resolved.window.toExclusive }
                : {}),
            }
          : undefined;

      const rows = await this.prisma.reconciliationFinding.findMany({
        where: {
          status: {
            in: [
              ReconciliationFindingStatus.OPEN,
              ReconciliationFindingStatus.ACKNOWLEDGED,
            ],
          },
          ...(createdAt ? { createdAt } : {}),
          ...(query.currency ? { currency: query.currency } : {}),
        },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: take + 1,
        ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
        select: {
          id: true,
          runId: true,
          domain: true,
          outcome: true,
          severity: true,
          status: true,
          fingerprint: true,
          leftLabel: true,
          leftValue: true,
          rightLabel: true,
          rightValue: true,
          currency: true,
          createdAt: true,
        },
      });
      const hasMore = rows.length > take;
      const page = hasMore ? rows.slice(0, take) : rows;
      return {
        items: page,
        nextCursor: hasMore ? (page[page.length - 1]?.id ?? null) : null,
        meta: await this.metaFor(now, resolved.filters),
      };
    } catch (err) {
      this.toBadRequest(err);
    }
  }
}
