/** Maps NotificationOutbox.eventName to template id, subject, and Handlebars context. */

export const OUTBOX_EVENT_ORDER_PLACED = 'OrderPlaced';
export const OUTBOX_EVENT_PAYMENT_CONFIRMED = 'PaymentConfirmed';
export const OUTBOX_EVENT_ADMIN_BROADCAST = 'AdminBroadcast';
export const OUTBOX_EVENT_ORDER_PROCESSING = 'OrderProcessing';
export const OUTBOX_EVENT_ORDER_FULFILLED = 'OrderFulfilled';
export const OUTBOX_EVENT_ORDER_DELIVERED = 'OrderDelivered';
export const OUTBOX_EVENT_ORDER_CANCELLED_CUSTOMER = 'OrderCancelledCustomer';
export const OUTBOX_EVENT_REFUND_COMPLETED = 'RefundCompleted';
export const OUTBOX_EVENT_DESIGN_MODERATION_APPROVED =
  'DesignModerationApproved';
export const OUTBOX_EVENT_DESIGN_MODERATION_REJECTED =
  'DesignModerationRejected';
export const OUTBOX_EVENT_ORGANIZER_PAYOUT_SUCCEEDED =
  'OrganizerPayoutSucceeded';
export const OUTBOX_EVENT_ORGANIZER_PAYOUT_FAILED = 'OrganizerPayoutFailed';
/** Pre-rendered HTML in payload (`subject`, `html`) for admin ops alerts. */
export const OUTBOX_EVENT_ADMIN_OPERATIONAL = 'admin.operational';

export interface OutboxMailDefinition {
  template: string;
  subject: string;
  context: Record<string, unknown>;
}

function asRecord(payload: unknown): Record<string, unknown> {
  return payload !== null && typeof payload === 'object'
    ? (payload as Record<string, unknown>)
    : {};
}

/**
 * Build template name, subject, and context for a transactional outbox row.
 * Returns null when the event is not supported for email.
 */
export function resolveOutboxMail(
  eventName: string,
  payload: unknown,
): OutboxMailDefinition | null {
  const p = asRecord(payload);
  switch (eventName) {
    case OUTBOX_EVENT_ORDER_PLACED: {
      const orderId = String(p.orderId ?? '');
      const totalAmount = Number(p.totalAmount ?? 0);
      const currency = String(p.currency ?? 'NGN');
      return {
        template: 'order-placed',
        subject: 'New order placed',
        context: { orderId, totalAmount, currency },
      };
    }
    case OUTBOX_EVENT_PAYMENT_CONFIRMED: {
      const orderId = String(p.orderId ?? '');
      const amount = Number(p.amount ?? p.totalAmount ?? 0);
      const currency = String(p.currency ?? 'NGN');
      const reference = p.reference != null ? String(p.reference) : '';
      return {
        template: 'payment-confirmed',
        subject: 'Payment confirmed — thank you',
        context: { orderId, amount, currency, reference },
      };
    }
    case OUTBOX_EVENT_ADMIN_BROADCAST: {
      const subject = String(p.subject ?? 'Message from Tamiym').slice(0, 200);
      const bodyHtml = String(p.bodyHtml ?? '');
      const firstName = String(p.firstName ?? '');
      return {
        template: 'admin-broadcast',
        subject,
        context: { bodyHtml, firstName, subject },
      };
    }
    case OUTBOX_EVENT_ORDER_PROCESSING: {
      const orderId = String(p.orderId ?? '');
      const firstName = String(p.firstName ?? '');
      return {
        template: 'order-processing',
        subject: 'Your order is being prepared',
        context: { orderId, firstName },
      };
    }
    case OUTBOX_EVENT_ORDER_FULFILLED: {
      const orderId = String(p.orderId ?? '');
      const firstName = String(p.firstName ?? '');
      return {
        template: 'order-fulfilled',
        subject: 'Your order has shipped',
        context: { orderId, firstName },
      };
    }
    case OUTBOX_EVENT_ORDER_DELIVERED: {
      const orderId = String(p.orderId ?? '');
      const firstName = String(p.firstName ?? '');
      return {
        template: 'order-delivered',
        subject: 'Your order was delivered',
        context: { orderId, firstName },
      };
    }
    case OUTBOX_EVENT_ORDER_CANCELLED_CUSTOMER: {
      const orderId = String(p.orderId ?? '');
      const firstName = String(p.firstName ?? '');
      return {
        template: 'order-cancelled-customer',
        subject: 'Your order was cancelled',
        context: { orderId, firstName },
      };
    }
    case OUTBOX_EVENT_REFUND_COMPLETED: {
      const orderId = String(p.orderId ?? '');
      const amount = Number(p.amount ?? 0);
      const currency = String(p.currency ?? 'NGN');
      const reason = p.reason != null ? String(p.reason) : '';
      const firstName = String(p.firstName ?? '');
      return {
        template: 'refund-completed',
        subject: 'Your refund has been processed',
        context: { orderId, amount, currency, reason, firstName },
      };
    }
    case OUTBOX_EVENT_DESIGN_MODERATION_APPROVED: {
      const designId = String(p.designId ?? '');
      const designName = String(p.designName ?? '');
      const productName = String(p.productName ?? '');
      const firstName = String(p.firstName ?? '');
      return {
        template: 'design-moderation-approved',
        subject: 'Your design was approved',
        context: { designId, designName, productName, firstName },
      };
    }
    case OUTBOX_EVENT_DESIGN_MODERATION_REJECTED: {
      const designId = String(p.designId ?? '');
      const designName = String(p.designName ?? '');
      const productName = String(p.productName ?? '');
      const firstName = String(p.firstName ?? '');
      return {
        template: 'design-moderation-rejected',
        subject: 'Update on your design',
        context: { designId, designName, productName, firstName },
      };
    }
    case OUTBOX_EVENT_ORGANIZER_PAYOUT_SUCCEEDED: {
      const payoutId = String(p.payoutId ?? '');
      const amount = Number(p.amount ?? 0);
      const currency = String(p.currency ?? 'NGN');
      const campaignTitle = String(p.campaignTitle ?? 'Your campaign');
      const firstName = String(p.firstName ?? '');
      return {
        template: 'organizer-payout-succeeded',
        subject: 'Payout sent for your campaign',
        context: { payoutId, amount, currency, campaignTitle, firstName },
      };
    }
    case OUTBOX_EVENT_ORGANIZER_PAYOUT_FAILED: {
      const payoutId = String(p.payoutId ?? '');
      const amount = Number(p.amount ?? 0);
      const currency = String(p.currency ?? 'NGN');
      const campaignTitle = String(p.campaignTitle ?? 'Your campaign');
      const firstName = String(p.firstName ?? '');
      const failureReason = String(p.failureReason ?? '');
      return {
        template: 'organizer-payout-failed',
        subject: 'Payout could not be completed',
        context: {
          payoutId,
          amount,
          currency,
          campaignTitle,
          firstName,
          failureReason,
        },
      };
    }
    case OUTBOX_EVENT_ADMIN_OPERATIONAL: {
      const subject = String(p.subject ?? 'Operational alert');
      const bodyHtml = String(p.html ?? '');
      return {
        template: 'admin-operational',
        subject,
        context: { subject, bodyHtml },
      };
    }
    default:
      return null;
  }
}
