/**
 * Home counters: an order counts as "placed" once it is paid. Drafts, unpaid orders and
 * cancelled or refunded ones are left out.
 */
import { OrderStatus } from '@tamiym/types';
import { summariseOrders } from '@/lib/order-summary';

const order = (id: string, status: OrderStatus) => ({ id, status });

describe('summariseOrders', () => {
  it('counts only paid or more advanced orders as placed', () => {
    const summary = summariseOrders([
      order('1', OrderStatus.DRAFT),
      order('2', OrderStatus.PENDING_PAYMENT),
      order('3', OrderStatus.PAID),
      order('4', OrderStatus.PROCESSING),
      order('5', OrderStatus.FULFILLED),
      order('6', OrderStatus.DELIVERED),
      order('7', OrderStatus.CANCELLED),
      order('8', OrderStatus.PARTIALLY_REFUNDED),
      order('9', OrderStatus.REFUNDED),
    ]);
    expect(summary.placedCount).toBe(4);
  });

  it('counts delivered orders, and pending as paid but not yet delivered', () => {
    const summary = summariseOrders([
      order('1', OrderStatus.DELIVERED),
      order('2', OrderStatus.DELIVERED),
      order('3', OrderStatus.PAID),
      order('4', OrderStatus.PROCESSING),
      order('5', OrderStatus.FULFILLED),
      order('6', OrderStatus.PENDING_PAYMENT),
      order('7', OrderStatus.DRAFT),
    ]);
    expect(summary.deliveredCount).toBe(2);
    expect(summary.pendingCount).toBe(3);
  });

  it('uses the most recent placed order as the latest one', () => {
    const summary = summariseOrders([
      order('newest-unpaid', OrderStatus.PENDING_PAYMENT),
      order('newest-cancelled', OrderStatus.CANCELLED),
      order('latest-placed', OrderStatus.PAID),
      order('older', OrderStatus.DELIVERED),
    ]);
    expect(summary.latestPlaced?.id).toBe('latest-placed');
  });

  it('is empty when there is no placed order', () => {
    const summary = summariseOrders([order('1', OrderStatus.DRAFT)]);
    expect(summary).toEqual({
      placedCount: 0,
      deliveredCount: 0,
      pendingCount: 0,
      latestPlaced: undefined,
    });
    expect(summariseOrders([])).toEqual(summary);
  });
});
