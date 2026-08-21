import {
  resolveAnalyticsQuery,
  activeCampaignWhere,
  PAID_LIFECYCLE_STATUSES,
} from './analytics-filters';
import {
  AnalyticsSalesChannel,
  resolveAnalyticsWindow,
} from './analytics-contract';

describe('analytics-filters', () => {
  it('builds order where with product and channel', () => {
    const resolved = resolveAnalyticsQuery({
      dateFrom: '2026-08-01',
      dateTo: '2026-08-01',
      productId: 'prod-1',
      channel: AnalyticsSalesChannel.STORE,
      campaignId: undefined,
    });

    expect(resolved.orderWhere).toEqual(
      expect.objectContaining({
        campaignId: null,
        items: { some: { productId: 'prod-1' } },
        createdAt: expect.objectContaining({
          gte: expect.any(Date),
          lt: expect.any(Date),
        }),
      }),
    );
    expect(resolved.paymentWhere.settlementClaim).toEqual({
      is: {
        createdAt: expect.objectContaining({
          gte: expect.any(Date),
          lt: expect.any(Date),
        }),
      },
    });
    expect(resolved.filters.channel).toBe('STORE');
  });

  it('prefers exact campaignId over derived channel', () => {
    const resolved = resolveAnalyticsQuery({
      campaignId: 'camp-1',
      channel: AnalyticsSalesChannel.FUNDRAISER,
    });
    expect(resolved.orderWhere.campaignId).toBe('camp-1');
  });

  it('requires settlement claim for unbounded settled revenue', () => {
    const resolved = resolveAnalyticsQuery({});
    expect(resolved.paymentWhere.settlementClaim).toEqual({ isNot: null });
    expect(resolved.refundWhere.settlementClaim).toEqual({ isNot: null });
  });

  it('lists paid lifecycle statuses for orderPaidCount', () => {
    expect(PAID_LIFECYCLE_STATUSES).toContain('PAID');
    expect(PAID_LIFECYCLE_STATUSES).toContain('REFUNDED');
    expect(PAID_LIFECYCLE_STATUSES).not.toContain('PENDING_PAYMENT');
  });

  it('activeCampaignWhere respects window bounds', () => {
    const window = resolveAnalyticsWindow('2026-08-01', '2026-08-31');
    const where = activeCampaignWhere(window);
    expect(where.status).toBe('ACTIVE');
    expect(where.AND).toBeDefined();
  });
});
