import { OrderStatus, PaymentStatus } from '../generated/prisma/enums';
import {
  canInitiatePaymentForOrder,
  isOrderPaymentWindowOpen,
  isPaymentRetryEligible,
} from './payment-eligibility';

describe('payment-eligibility (TTW-033)', () => {
  const now = new Date('2026-08-21T12:00:00.000Z');

  it('treats null expiry as open', () => {
    expect(isOrderPaymentWindowOpen(null, now)).toBe(true);
  });

  it('rejects initiate when order expired', () => {
    expect(
      canInitiatePaymentForOrder({
        status: OrderStatus.PENDING_PAYMENT,
        expiresAt: new Date('2026-08-21T11:00:00.000Z'),
        now,
      }),
    ).toBe(false);
  });

  it('allows initiate when PENDING_PAYMENT and unexpired even with active attempt', () => {
    expect(
      canInitiatePaymentForOrder({
        status: OrderStatus.PENDING_PAYMENT,
        expiresAt: new Date('2026-08-21T13:00:00.000Z'),
        now,
      }),
    ).toBe(true);
  });

  it('hides retry CTA when an active attempt exists', () => {
    expect(
      isPaymentRetryEligible({
        status: OrderStatus.PENDING_PAYMENT,
        expiresAt: new Date('2026-08-21T13:00:00.000Z'),
        payments: [
          {
            status: PaymentStatus.PENDING,
            expiresAt: new Date('2026-08-21T12:30:00.000Z'),
          },
        ],
        now,
      }),
    ).toBe(false);
  });
});
