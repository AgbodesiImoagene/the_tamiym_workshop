import {
  ANALYTICS_KPI_POLICY_VERSION,
  AnalyticsFreshnessStatus,
  AnalyticsQueryError,
  AnalyticsQueryErrorCode,
  assertSupportedCurrency,
  buildAnalyticsMeta,
  clampDrilldownTake,
  evaluateFreshness,
  lagosDayIso,
  lagosDayStartUtc,
  moneyNumber,
  parseExportEntity,
  parseSalesChannel,
  resolveAnalyticsWindow,
} from './analytics-contract';

describe('analytics-contract', () => {
  describe('Lagos window', () => {
    it('maps Lagos civil day to UTC+1 midnight', () => {
      const start = lagosDayStartUtc('2026-08-21');
      expect(start.toISOString()).toBe('2026-08-20T23:00:00.000Z');
      expect(lagosDayIso(start)).toBe('2026-08-21');
    });

    it('builds inclusive/exclusive window', () => {
      const w = resolveAnalyticsWindow('2026-08-01', '2026-08-02');
      expect(w.fromInclusive?.toISOString()).toBe('2026-07-31T23:00:00.000Z');
      expect(w.toExclusive?.toISOString()).toBe('2026-08-02T23:00:00.000Z');
    });

    it('rejects reversed windows', () => {
      expect(() => resolveAnalyticsWindow('2026-08-10', '2026-08-01')).toThrow(
        AnalyticsQueryError,
      );
      try {
        resolveAnalyticsWindow('2026-08-10', '2026-08-01');
      } catch (e) {
        expect((e as AnalyticsQueryError).code).toBe(
          AnalyticsQueryErrorCode.REVERSED_WINDOW,
        );
      }
    });

    it('rejects oversized ranges', () => {
      expect(() => resolveAnalyticsWindow('2024-01-01', '2025-12-31')).toThrow(
        AnalyticsQueryError,
      );
    });

    it('rejects invalid dates', () => {
      expect(() => resolveAnalyticsWindow('2026-13-01')).toThrow(
        AnalyticsQueryError,
      );
      expect(() => lagosDayStartUtc('not-a-date')).toThrow(AnalyticsQueryError);
    });
  });

  describe('filters', () => {
    it('accepts NGN and rejects other currencies', () => {
      expect(assertSupportedCurrency('NGN')).toBe('NGN');
      expect(assertSupportedCurrency(undefined)).toBe('NGN');
      expect(() => assertSupportedCurrency('USD')).toThrow(AnalyticsQueryError);
    });

    it('parses channel and export entity', () => {
      expect(parseSalesChannel('STORE')).toBe('STORE');
      expect(parseSalesChannel(undefined)).toBeUndefined();
      expect(() => parseSalesChannel('MOBILE')).toThrow(AnalyticsQueryError);
      expect(parseExportEntity(undefined)).toBe('orders');
      expect(parseExportEntity('campaigns')).toBe('campaigns');
      expect(() => parseExportEntity('payouts')).toThrow(AnalyticsQueryError);
    });

    it('clamps drill-down take', () => {
      expect(clampDrilldownTake(undefined)).toBe(50);
      expect(clampDrilldownTake(200)).toBe(100);
      expect(() => clampDrilldownTake(0)).toThrow(AnalyticsQueryError);
    });
  });

  describe('freshness and meta', () => {
    it('marks OK within SLO and STALE beyond', () => {
      const now = new Date('2026-08-21T12:00:00.000Z');
      const ok = evaluateFreshness({
        now,
        lastReconciliationFinishedAt: new Date('2026-08-21T01:00:00.000Z'),
      });
      expect(ok.status).toBe(AnalyticsFreshnessStatus.OK);

      const stale = evaluateFreshness({
        now,
        lastReconciliationFinishedAt: new Date('2026-08-19T01:00:00.000Z'),
      });
      expect(stale.status).toBe(AnalyticsFreshnessStatus.STALE);

      const unknown = evaluateFreshness({
        now,
        lastReconciliationFinishedAt: null,
      });
      expect(unknown.status).toBe(AnalyticsFreshnessStatus.UNKNOWN);
    });

    it('builds response meta with definition version', () => {
      const meta = buildAnalyticsMeta({
        now: new Date('2026-08-21T12:00:00.000Z'),
        currency: 'NGN',
        filters: { currency: 'NGN', dateFrom: '2026-08-01' },
        lastReconciliationFinishedAt: null,
      });
      expect(meta.definitionVersion).toBe(ANALYTICS_KPI_POLICY_VERSION);
      expect(meta.timezone).toBe('Africa/Lagos');
      expect(meta.appliedFilters.dateFrom).toBe('2026-08-01');
    });
  });

  describe('moneyNumber', () => {
    it('coerces decimal-like values safely', () => {
      expect(moneyNumber(null)).toBe(0);
      expect(moneyNumber('1250.50')).toBe(1250.5);
      expect(moneyNumber({ toString: () => '99.00' })).toBe(99);
      expect(moneyNumber(Number.NaN)).toBe(0);
    });
  });
});
