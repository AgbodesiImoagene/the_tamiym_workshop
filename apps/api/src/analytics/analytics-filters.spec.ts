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

  it('propagates paymentStatus into settlement and refund order filters', () => {
    const resolved = resolveAnalyticsQuery({
      paymentStatus: 'SUCCEEDED',
    });
    expect(resolved.orderWhere.paymentStatus).toBe('SUCCEEDED');
    expect(resolved.paymentWhere.order).toEqual({
      is: expect.objectContaining({ paymentStatus: 'SUCCEEDED' }),
    });
    expect(resolved.refundWhere.order).toEqual({
      is: expect.objectContaining({ paymentStatus: 'SUCCEEDED' }),
    });
  });

  it('always constrains money queries to resolved NGN currency', () => {
    const resolved = resolveAnalyticsQuery({});
    expect(resolved.filters.currency).toBe('NGN');
    expect(resolved.orderWhere.currency).toBe('NGN');
    expect(resolved.paymentWhere.currency).toBe('NGN');
    expect(resolved.refundWhere.currency).toBe('NGN');
    expect(resolved.payoutWhere.currency).toBe('NGN');
    expect(resolved.campaignWhere.currency).toBe('NGN');
  });

  it('STORE channel yields no campaign payouts; productId scopes payouts', () => {
    const store = resolveAnalyticsQuery({
      channel: AnalyticsSalesChannel.STORE,
    });
    expect(store.payoutWhere.campaignId).toEqual({ in: [] });

    const byProduct = resolveAnalyticsQuery({ productId: 'prod-1' });
    expect(byProduct.payoutWhere.campaign).toEqual({
      is: { products: { some: { productId: 'prod-1' } } },
    });
  });

  it('activeCampaignWhere respects campaignId and currency', () => {
    const window = resolveAnalyticsWindow('2026-08-01', '2026-08-31');
    const where = activeCampaignWhere(window, {
      campaignId: 'camp-1',
      currency: 'NGN',
    });
    expect(where).toEqual(
      expect.objectContaining({
        status: 'ACTIVE',
        id: 'camp-1',
        currency: 'NGN',
      }),
    );
  });
});
