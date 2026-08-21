/**
 * Prisma where builders for TTW-036 analytics filters.
 * Keep query construction here so overview / export / drill-downs stay aligned.
 */

import { OrderStatus, Prisma } from '../generated/prisma/client';
import {
  AnalyticsSalesChannel,
  AnalyticsWindow,
  AppliedAnalyticsFilters,
  assertSupportedCurrency,
  createdAtFilter,
  parseSalesChannel,
  resolveAnalyticsWindow,
} from './analytics-contract';
import type { AnalyticsQueryDto } from './dto/analytics-query.dto';

/** Post-payment commercial lifecycle statuses (orderPaidCount). */
export const PAID_LIFECYCLE_STATUSES: OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.FULFILLED,
  OrderStatus.DELIVERED,
  OrderStatus.PARTIALLY_REFUNDED,
  OrderStatus.REFUNDED,
];

export type ResolvedAnalyticsQuery = {
  window: AnalyticsWindow;
  filters: AppliedAnalyticsFilters;
  orderWhere: Prisma.OrderWhereInput;
  campaignWhere: Prisma.CampaignWhereInput;
  paymentWhere: Prisma.PaymentWhereInput;
  refundWhere: Prisma.RefundWhereInput;
  payoutWhere: Prisma.PayoutWhereInput;
};

function channelWhere(
  channel?: AnalyticsSalesChannel,
): Prisma.OrderWhereInput | undefined {
  if (channel === AnalyticsSalesChannel.STORE) {
    return { campaignId: null };
  }
  if (channel === AnalyticsSalesChannel.FUNDRAISER) {
    return { campaignId: { not: null } };
  }
  return undefined;
}

export function resolveAnalyticsQuery(
  query: AnalyticsQueryDto,
): ResolvedAnalyticsQuery {
  const window = resolveAnalyticsWindow(query.dateFrom, query.dateTo);
  const currency = assertSupportedCurrency(query.currency);
  const channel = parseSalesChannel(query.channel);
  const createdAt = createdAtFilter(window);

  const filters: AppliedAnalyticsFilters = {
    ...(window.dateFrom ? { dateFrom: window.dateFrom } : {}),
    ...(window.dateTo ? { dateTo: window.dateTo } : {}),
    ...(query.campaignId ? { campaignId: query.campaignId } : {}),
    ...(query.productId ? { productId: query.productId } : {}),
    ...(query.orderStatus ? { orderStatus: query.orderStatus } : {}),
    ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
    ...(channel ? { channel } : {}),
    currency,
    ...(query.entity ? { entity: query.entity } : {}),
  };

  const orderWhere: Prisma.OrderWhereInput = {
    status: { not: OrderStatus.DRAFT },
    ...(createdAt ? { createdAt } : {}),
    ...(query.orderStatus ? { status: query.orderStatus } : {}),
    ...(query.paymentStatus ? { paymentStatus: query.paymentStatus } : {}),
    ...(query.currency ? { currency: query.currency } : {}),
    // Exact campaignId wins; derived channel only when campaignId omitted.
    ...(query.campaignId
      ? { campaignId: query.campaignId }
      : (channelWhere(channel) ?? {})),
    ...(query.productId
      ? { items: { some: { productId: query.productId } } }
      : {}),
  };

  // If both "not DRAFT" and explicit orderStatus are set, explicit wins.
  if (query.orderStatus) {
    orderWhere.status = query.orderStatus;
  }

  const campaignWhere: Prisma.CampaignWhereInput = {
    ...(createdAt ? { createdAt } : {}),
    ...(query.campaignId ? { id: query.campaignId } : {}),
    ...(query.currency ? { currency: query.currency } : {}),
  };

  const orderRelationFilter: Prisma.OrderWhereInput = {
    ...(query.campaignId
      ? { campaignId: query.campaignId }
      : (channelWhere(channel) ?? {})),
    ...(query.orderStatus ? { status: query.orderStatus } : {}),
    ...(query.productId
      ? { items: { some: { productId: query.productId } } }
      : {}),
  };

  const paymentWhere: Prisma.PaymentWhereInput = {
    status: 'SUCCEEDED',
    ...(query.currency ? { currency: query.currency } : {}),
    settlementClaim: createdAt ? { is: { createdAt } } : { isNot: null },
    order: {
      is: orderRelationFilter,
    },
  };

  const refundWhere: Prisma.RefundWhereInput = {
    status: 'SUCCEEDED',
    ...(query.currency ? { currency: query.currency } : {}),
    settlementClaim: createdAt ? { is: { createdAt } } : { isNot: null },
    order: {
      is: orderRelationFilter,
    },
  };

  const payoutWhere: Prisma.PayoutWhereInput = {
    status: 'SUCCEEDED',
    ...(createdAt ? { createdAt } : {}),
    ...(query.campaignId ? { campaignId: query.campaignId } : {}),
    ...(query.currency ? { currency: query.currency } : {}),
  };

  return {
    window,
    filters,
    orderWhere,
    campaignWhere,
    paymentWhere,
    refundWhere,
    payoutWhere,
  };
}

export function activeCampaignWhere(
  window: AnalyticsWindow,
): Prisma.CampaignWhereInput {
  return {
    status: 'ACTIVE',
    ...(window.toExclusive || window.fromInclusive
      ? {
          AND: [
            ...(window.toExclusive
              ? [{ createdAt: { lt: window.toExclusive } }]
              : []),
            ...(window.fromInclusive
              ? [
                  {
                    OR: [
                      { endDate: null },
                      { endDate: { gte: window.fromInclusive } },
                    ],
                  },
                ]
              : []),
          ],
        }
      : {}),
  };
}
