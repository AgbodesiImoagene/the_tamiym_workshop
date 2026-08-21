import { OrderStatus, PaymentStatus } from '../generated/prisma/enums';

/**
 * Shared payment-initiation / retry eligibility (TTW-033).
 * Policy: customer-order-detail/v1-interim-2026-08-21
 */

export type PaymentEligibilityOrder = {
  status: OrderStatus;
  expiresAt: Date | string | null;
  payments: Array<{
    status: PaymentStatus;
    expiresAt?: Date | string | null;
  }>;
};

function asDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  return value instanceof Date ? value : new Date(value);
}

/** True when the order is still within its payment window (or has no expiry). */
export function isOrderPaymentWindowOpen(
  expiresAt: Date | string | null,
  now: Date = new Date(),
): boolean {
  const expiry = asDate(expiresAt);
  if (expiry == null) return true;
  return expiry.getTime() > now.getTime();
}

/**
 * Customer may see a "pay / retry" CTA when the order is PENDING_PAYMENT,
 * unexpired, and there is no active (unexpired PENDING|INITIATED) attempt.
 * Starting or resuming payment via initiate-payment still allows an active
 * attempt to be reconciled — that path only requires window + status.
 */
export function isPaymentRetryEligible(
  input: PaymentEligibilityOrder & { now?: Date },
): boolean {
  if (input.status !== OrderStatus.PENDING_PAYMENT) {
    return false;
  }
  const now = input.now ?? new Date();
  if (!isOrderPaymentWindowOpen(input.expiresAt, now)) {
    return false;
  }
  const hasActiveAttempt = input.payments.some((payment) => {
    if (
      payment.status !== PaymentStatus.PENDING &&
      payment.status !== PaymentStatus.INITIATED
    ) {
      return false;
    }
    if (payment.expiresAt == null) {
      return true;
    }
    const attemptExpires = asDate(payment.expiresAt)!;
    return attemptExpires.getTime() > now.getTime();
  });
  return !hasActiveAttempt;
}

/** initiate-payment may run when status is PENDING_PAYMENT and the window is open. */
export function canInitiatePaymentForOrder(
  input: Pick<PaymentEligibilityOrder, 'status' | 'expiresAt'> & {
    now?: Date;
  },
): boolean {
  if (input.status !== OrderStatus.PENDING_PAYMENT) {
    return false;
  }
  return isOrderPaymentWindowOpen(input.expiresAt, input.now ?? new Date());
}
