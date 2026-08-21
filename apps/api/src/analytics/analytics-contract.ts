/**
 * TTW-036 slice 1 — versioned analytics KPI contract constants and pure helpers.
 * Policy: docs/analytics/ttw-036-interim-policy.md
 *
 * Server authority only. Clients must not invent metric definitions or coerce filters.
 */

export const ANALYTICS_KPI_POLICY_VERSION =
  'analytics-kpi/v1-interim-2026-08-21';

export const ANALYTICS_TIMEZONE = 'Africa/Lagos';

/** Max inclusive Lagos calendar span for a date window. */
export const ANALYTICS_MAX_RANGE_DAYS = 366;

/** Default / max page sizes for drill-downs. */
export const ANALYTICS_DRILLDOWN_DEFAULT_TAKE = 50;
export const ANALYTICS_DRILLDOWN_MAX_TAKE = 100;

/** Hard export row cap — reject rather than silently truncate. */
export const ANALYTICS_EXPORT_MAX_ROWS = 10_000;

/** Freshness SLO: completed internal reconciliation within this lag. */
export const ANALYTICS_FRESHNESS_SLO_MS = 26 * 60 * 60 * 1000;

export const AnalyticsMetricId = {
  ORDER_COUNT: 'orderCount',
  ORDER_PAID_COUNT: 'orderPaidCount',
  GROSS_ORDER_VALUE: 'grossOrderValue',
  SETTLED_REVENUE: 'settledRevenue',
  REFUNDED_VALUE: 'refundedValue',
  NET_REVENUE: 'netRevenue',
  CAMPAIGN_GROSS_RAISED: 'campaignGrossRaised',
  ELIGIBLE_LEDGER_BALANCE: 'eligibleLedgerBalance',
  PAID_OUT_VALUE: 'paidOutValue',
  ACTIVE_CAMPAIGN_COUNT: 'activeCampaignCount',
  CAMPAIGNS_CREATED_COUNT: 'campaignsCreatedCount',
} as const;

export type AnalyticsMetricId =
  (typeof AnalyticsMetricId)[keyof typeof AnalyticsMetricId];

export const AnalyticsSalesChannel = {
  STORE: 'STORE',
  FUNDRAISER: 'FUNDRAISER',
} as const;

export type AnalyticsSalesChannel =
  (typeof AnalyticsSalesChannel)[keyof typeof AnalyticsSalesChannel];

export const AnalyticsExportEntity = {
  ORDERS: 'orders',
  CAMPAIGNS: 'campaigns',
} as const;

export type AnalyticsExportEntity =
  (typeof AnalyticsExportEntity)[keyof typeof AnalyticsExportEntity];

export const AnalyticsFreshnessStatus = {
  OK: 'OK',
  STALE: 'STALE',
  UNKNOWN: 'UNKNOWN',
} as const;

export type AnalyticsFreshnessStatus =
  (typeof AnalyticsFreshnessStatus)[keyof typeof AnalyticsFreshnessStatus];

export const AnalyticsQueryErrorCode = {
  INVALID_DATE: 'ANALYTICS_INVALID_DATE',
  REVERSED_WINDOW: 'ANALYTICS_REVERSED_WINDOW',
  RANGE_TOO_LARGE: 'ANALYTICS_RANGE_TOO_LARGE',
  UNSUPPORTED_CURRENCY: 'ANALYTICS_UNSUPPORTED_CURRENCY',
  UNKNOWN_CHANNEL: 'ANALYTICS_UNKNOWN_CHANNEL',
  UNKNOWN_ENTITY: 'ANALYTICS_UNKNOWN_ENTITY',
  UNKNOWN_ORDER_STATUS: 'ANALYTICS_UNKNOWN_ORDER_STATUS',
  UNKNOWN_PAYMENT_STATUS: 'ANALYTICS_UNKNOWN_PAYMENT_STATUS',
  INVALID_PAGINATION: 'ANALYTICS_INVALID_PAGINATION',
  EXPORT_LIMIT_EXCEEDED: 'ANALYTICS_EXPORT_LIMIT_EXCEEDED',
} as const;

export type AnalyticsQueryErrorCode =
  (typeof AnalyticsQueryErrorCode)[keyof typeof AnalyticsQueryErrorCode];

const LAGOS_OFFSET_MS = 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export type AnalyticsWindow = {
  /** Inclusive UTC instant for Lagos start of dateFrom (or undefined). */
  fromInclusive?: Date;
  /** Exclusive UTC instant for Lagos start of day after dateTo (or undefined). */
  toExclusive?: Date;
  dateFrom?: string;
  dateTo?: string;
};

export type AppliedAnalyticsFilters = {
  dateFrom?: string;
  dateTo?: string;
  campaignId?: string;
  productId?: string;
  orderStatus?: string;
  paymentStatus?: string;
  channel?: AnalyticsSalesChannel;
  currency: 'NGN';
  entity?: AnalyticsExportEntity;
};

export type AnalyticsResponseMeta = {
  definitionVersion: string;
  generatedAt: string;
  dataCutoffAt: string;
  timezone: string;
  currency: 'NGN';
  appliedFilters: AppliedAnalyticsFilters;
  freshness: {
    status: AnalyticsFreshnessStatus;
    sloMs: number;
    lastReconciliationFinishedAt: string | null;
  };
};

/**
 * Parse a Lagos civil date `YYYY-MM-DD` to the UTC instant of 00:00 Africa/Lagos.
 */
export function lagosDayStartUtc(isoDate: string): Date {
  if (!DATE_RE.test(isoDate)) {
    throw new AnalyticsQueryError(
      AnalyticsQueryErrorCode.INVALID_DATE,
      `Invalid Lagos date: ${isoDate}`,
    );
  }
  const [y, m, d] = isoDate.split('-').map(Number);
  // Construct via UTC components then subtract Lagos offset so local midnight
  // maps correctly (Africa/Lagos is fixed UTC+1, no DST).
  const utcGuess = Date.UTC(y, m - 1, d, 0, 0, 0) - LAGOS_OFFSET_MS;
  const date = new Date(utcGuess);
  if (!isFinite(date.getTime()) || lagosDayIso(date) !== isoDate) {
    throw new AnalyticsQueryError(
      AnalyticsQueryErrorCode.INVALID_DATE,
      `Invalid Lagos date: ${isoDate}`,
    );
  }
  return date;
}

/** Lagos calendar day `YYYY-MM-DD` for an instant (UTC+1, no DST). */
export function lagosDayIso(date: Date): string {
  const lagos = new Date(date.getTime() + LAGOS_OFFSET_MS);
  return lagos.toISOString().slice(0, 10);
}

export function resolveAnalyticsWindow(
  dateFrom?: string,
  dateTo?: string,
): AnalyticsWindow {
  if (dateFrom !== undefined && !DATE_RE.test(dateFrom)) {
    throw new AnalyticsQueryError(
      AnalyticsQueryErrorCode.INVALID_DATE,
      'dateFrom must be YYYY-MM-DD in Africa/Lagos',
    );
  }
  if (dateTo !== undefined && !DATE_RE.test(dateTo)) {
    throw new AnalyticsQueryError(
      AnalyticsQueryErrorCode.INVALID_DATE,
      'dateTo must be YYYY-MM-DD in Africa/Lagos',
    );
  }
  if (dateFrom && dateTo && dateFrom > dateTo) {
    throw new AnalyticsQueryError(
      AnalyticsQueryErrorCode.REVERSED_WINDOW,
      'dateFrom must be on or before dateTo',
    );
  }
  if (dateFrom && dateTo) {
    const start = lagosDayStartUtc(dateFrom);
    const endExclusive = new Date(lagosDayStartUtc(dateTo).getTime() + DAY_MS);
    const spanDays = Math.round(
      (endExclusive.getTime() - start.getTime()) / DAY_MS,
    );
    if (spanDays > ANALYTICS_MAX_RANGE_DAYS) {
      throw new AnalyticsQueryError(
        AnalyticsQueryErrorCode.RANGE_TOO_LARGE,
        `Date range may not exceed ${ANALYTICS_MAX_RANGE_DAYS} days`,
      );
    }
    return {
      fromInclusive: start,
      toExclusive: endExclusive,
      dateFrom,
      dateTo,
    };
  }
  if (dateFrom) {
    return {
      fromInclusive: lagosDayStartUtc(dateFrom),
      dateFrom,
    };
  }
  if (dateTo) {
    return {
      toExclusive: new Date(lagosDayStartUtc(dateTo).getTime() + DAY_MS),
      dateTo,
    };
  }
  return {};
}

export function createdAtFilter(
  window: AnalyticsWindow,
): { gte?: Date; lt?: Date } | undefined {
  if (!window.fromInclusive && !window.toExclusive) return undefined;
  return {
    ...(window.fromInclusive ? { gte: window.fromInclusive } : {}),
    ...(window.toExclusive ? { lt: window.toExclusive } : {}),
  };
}

export function clampDrilldownTake(raw?: number): number {
  if (raw === undefined || Number.isNaN(raw)) {
    return ANALYTICS_DRILLDOWN_DEFAULT_TAKE;
  }
  if (!Number.isFinite(raw) || raw < 1) {
    throw new AnalyticsQueryError(
      AnalyticsQueryErrorCode.INVALID_PAGINATION,
      'take must be a positive integer',
    );
  }
  return Math.min(Math.floor(raw), ANALYTICS_DRILLDOWN_MAX_TAKE);
}

export function parseExportEntity(
  entity: string | undefined,
): AnalyticsExportEntity {
  if (entity === undefined || entity === '') {
    return AnalyticsExportEntity.ORDERS;
  }
  if (
    entity === AnalyticsExportEntity.ORDERS ||
    entity === AnalyticsExportEntity.CAMPAIGNS
  ) {
    return entity;
  }
  throw new AnalyticsQueryError(
    AnalyticsQueryErrorCode.UNKNOWN_ENTITY,
    `Unknown export entity: ${entity}`,
  );
}

export function parseSalesChannel(
  channel: string | undefined,
): AnalyticsSalesChannel | undefined {
  if (channel === undefined || channel === '') return undefined;
  if (
    channel === AnalyticsSalesChannel.STORE ||
    channel === AnalyticsSalesChannel.FUNDRAISER
  ) {
    return channel;
  }
  throw new AnalyticsQueryError(
    AnalyticsQueryErrorCode.UNKNOWN_CHANNEL,
    `Unknown channel: ${channel}`,
  );
}

export function assertSupportedCurrency(currency?: string): 'NGN' {
  if (currency === undefined || currency === '' || currency === 'NGN') {
    return 'NGN';
  }
  throw new AnalyticsQueryError(
    AnalyticsQueryErrorCode.UNSUPPORTED_CURRENCY,
    `Unsupported currency: ${currency}`,
  );
}

export function evaluateFreshness(input: {
  now: Date;
  lastReconciliationFinishedAt: Date | null;
}): {
  status: AnalyticsFreshnessStatus;
  sloMs: number;
  lastReconciliationFinishedAt: string | null;
} {
  const sloMs = ANALYTICS_FRESHNESS_SLO_MS;
  if (!input.lastReconciliationFinishedAt) {
    return {
      status: AnalyticsFreshnessStatus.UNKNOWN,
      sloMs,
      lastReconciliationFinishedAt: null,
    };
  }
  const age =
    input.now.getTime() - input.lastReconciliationFinishedAt.getTime();
  return {
    status:
      age <= sloMs
        ? AnalyticsFreshnessStatus.OK
        : AnalyticsFreshnessStatus.STALE,
    sloMs,
    lastReconciliationFinishedAt:
      input.lastReconciliationFinishedAt.toISOString(),
  };
}

export function buildAnalyticsMeta(input: {
  now: Date;
  currency: 'NGN';
  filters: AppliedAnalyticsFilters;
  lastReconciliationFinishedAt: Date | null;
}): AnalyticsResponseMeta {
  return {
    definitionVersion: ANALYTICS_KPI_POLICY_VERSION,
    generatedAt: input.now.toISOString(),
    dataCutoffAt: input.now.toISOString(),
    timezone: ANALYTICS_TIMEZONE,
    currency: input.currency,
    appliedFilters: input.filters,
    freshness: evaluateFreshness({
      now: input.now,
      lastReconciliationFinishedAt: input.lastReconciliationFinishedAt,
    }),
  };
}

/** Convert Prisma Decimal / number / string sums to a finite JS number for JSON. */
export function moneyNumber(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  if (typeof value === 'string') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  if (
    typeof value === 'object' &&
    value !== null &&
    'toString' in value &&
    typeof (value as { toString: () => string }).toString === 'function'
  ) {
    const n = Number((value as { toString: () => string }).toString());
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export class AnalyticsQueryError extends Error {
  constructor(
    readonly code: AnalyticsQueryErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AnalyticsQueryError';
  }
}
