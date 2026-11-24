import { OrderStatus } from '@tamiym/types';

/** Paid, in progress or delivered: an order the customer has really placed. */
const PLACED_STATUSES: readonly OrderStatus[] = [
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.FULFILLED,
  OrderStatus.DELIVERED,
];

/**
 * Figures shown on the Home page. Drafts, orders waiting for payment, cancelled and refunded
 * orders are not counted. `orders` is newest first, as the API returns it.
 */
export function summariseOrders<T extends { status: OrderStatus }>(orders: readonly T[]) {
  const placed = orders.filter((order) => PLACED_STATUSES.includes(order.status));
  const deliveredCount = placed.filter((order) => order.status === OrderStatus.DELIVERED).length;

  return {
    placedCount: placed.length,
    deliveredCount,
    pendingCount: placed.length - deliveredCount,
    latestPlaced: placed[0] as T | undefined,
  };
}
