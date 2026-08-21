/** Maps NotificationOutbox.eventName to template id, subject, and Handlebars context. */

import { asScalarString } from './notification-outbox-delivery.helpers';

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
export const OUTBOX_EVENT_ORGANIZER_APPLICATION_APPROVED =
  'organiser.application.approved';
export const OUTBOX_EVENT_ORGANIZER_APPLICATION_REJECTED =
  'organiser.application.rejected';
export const OUTBOX_EVENT_ORGANIZER_CAMPAIGN_APPROVED =
  'organiser.campaign.approved';
export const OUTBOX_EVENT_ORGANIZER_CAMPAIGN_REJECTED =
  'organiser.campaign.rejected';
export const OUTBOX_EVENT_ORGANIZER_CAMPAIGN_RESUMED =
  'organiser.campaign.resumed';
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
      const orderId = asScalarString(p.orderId);
      const totalAmount = Number(p.totalAmount ?? 0);
      const currency = asScalarString(p.currency, 'NGN');
      return {
        template: 'order-placed',
        subject: 'New order placed',
        context: { orderId, totalAmount, currency },
      };
    }
    case OUTBOX_EVENT_PAYMENT_CONFIRMED: {
      const orderId = asScalarString(p.orderId);
      const amount = Number(p.amount ?? p.totalAmount ?? 0);
      const currency = asScalarString(p.currency, 'NGN');
      const reference = asScalarString(p.reference);
      return {
        template: 'payment-confirmed',
        subject: 'Payment confirmed — thank you',
        context: { orderId, amount, currency, reference },
      };
    }
    case OUTBOX_EVENT_ADMIN_BROADCAST: {
      const subject = asScalarString(p.subject, 'Message from Tamiym').slice(
        0,
        200,
      );
      const bodyHtml = asScalarString(p.bodyHtml);
      const firstName = asScalarString(p.firstName);
      return {
        template: 'admin-broadcast',
        subject,
        context: { bodyHtml, firstName, subject },
      };
    }
    case OUTBOX_EVENT_ORDER_PROCESSING: {
      const orderId = asScalarString(p.orderId);
      const firstName = asScalarString(p.firstName);
      return {
        template: 'order-processing',
        subject: 'Your order is being prepared',
        context: { orderId, firstName },
      };
    }
    case OUTBOX_EVENT_ORDER_FULFILLED: {
      const orderId = asScalarString(p.orderId);
      const firstName = asScalarString(p.firstName);
      return {
        template: 'order-fulfilled',
        subject: 'Your order has shipped',
        context: { orderId, firstName },
      };
    }
    case OUTBOX_EVENT_ORDER_DELIVERED: {
      const orderId = asScalarString(p.orderId);
      const firstName = asScalarString(p.firstName);
      return {
        template: 'order-delivered',
        subject: 'Your order was delivered',
        context: { orderId, firstName },
      };
    }
    case OUTBOX_EVENT_ORDER_CANCELLED_CUSTOMER: {
      const orderId = asScalarString(p.orderId);
      const firstName = asScalarString(p.firstName);
      return {
        template: 'order-cancelled-customer',
        subject: 'Your order was cancelled',
        context: { orderId, firstName },
      };
    }
    case OUTBOX_EVENT_REFUND_COMPLETED: {
      const orderId = asScalarString(p.orderId);
      const amount = Number(p.amount ?? 0);
      const currency = asScalarString(p.currency, 'NGN');
      const reason = asScalarString(p.reason);
      const firstName = asScalarString(p.firstName);
      return {
        template: 'refund-completed',
        subject: 'Your refund has been processed',
        context: { orderId, amount, currency, reason, firstName },
      };
    }
    case OUTBOX_EVENT_DESIGN_MODERATION_APPROVED: {
      const designId = asScalarString(p.designId);
      const designName = asScalarString(p.designName);
      const productName = asScalarString(p.productName);
      const firstName = asScalarString(p.firstName);
      return {
        template: 'design-moderation-approved',
        subject: 'Your design was approved',
        context: { designId, designName, productName, firstName },
      };
    }
    case OUTBOX_EVENT_DESIGN_MODERATION_REJECTED: {
      const designId = asScalarString(p.designId);
      const designName = asScalarString(p.designName);
      const productName = asScalarString(p.productName);
      const firstName = asScalarString(p.firstName);
      return {
        template: 'design-moderation-rejected',
        subject: 'Update on your design',
        context: { designId, designName, productName, firstName },
      };
    }
    case OUTBOX_EVENT_ORGANIZER_PAYOUT_SUCCEEDED: {
      const payoutId = asScalarString(p.payoutId);
      const amount = Number(p.amount ?? 0);
      const currency = asScalarString(p.currency, 'NGN');
      const campaignTitle = asScalarString(p.campaignTitle, 'Your campaign');
      const firstName = asScalarString(p.firstName);
      return {
        template: 'organizer-payout-succeeded',
        subject: 'Payout sent for your campaign',
        context: { payoutId, amount, currency, campaignTitle, firstName },
      };
    }
    case OUTBOX_EVENT_ORGANIZER_PAYOUT_FAILED: {
      const payoutId = asScalarString(p.payoutId);
      const amount = Number(p.amount ?? 0);
      const currency = asScalarString(p.currency, 'NGN');
      const campaignTitle = asScalarString(p.campaignTitle, 'Your campaign');
      const firstName = asScalarString(p.firstName);
      const failureReason = asScalarString(p.failureReason);
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
      const subject = asScalarString(p.subject, 'Operational alert');
      const bodyHtml = asScalarString(p.html);
      return {
        template: 'admin-operational',
        subject,
        context: { subject, bodyHtml },
      };
    }
    case OUTBOX_EVENT_ORGANIZER_APPLICATION_APPROVED: {
      const firstName = asScalarString(p.firstName);
      return {
        template: 'organizer-application-approved',
        subject: 'Your organiser application was approved',
        context: { firstName },
      };
    }
    case OUTBOX_EVENT_ORGANIZER_APPLICATION_REJECTED: {
      const firstName = asScalarString(p.firstName);
      const customerVisibleReason = asScalarString(
        p.customerVisibleReason,
        'Your application was not approved.',
      );
      return {
        template: 'organizer-application-rejected',
        subject: 'Update on your organiser application',
        context: { firstName, customerVisibleReason },
      };
    }
    case OUTBOX_EVENT_ORGANIZER_CAMPAIGN_APPROVED: {
      const firstName = asScalarString(p.firstName);
      const campaignTitle = asScalarString(p.campaignTitle, 'Your campaign');
      const mode = asScalarString(p.mode, 'live');
      const startDate = asScalarString(p.startDate);
      const scheduled = mode === 'scheduled';
      return {
        template: scheduled
          ? 'organizer-campaign-approved-scheduled'
          : 'organizer-campaign-approved-live',
        subject: scheduled
          ? 'Your campaign was approved and is scheduled'
          : 'Your campaign was approved and is live',
        context: { firstName, campaignTitle, startDate, mode },
      };
    }
    case OUTBOX_EVENT_ORGANIZER_CAMPAIGN_REJECTED: {
      const firstName = asScalarString(p.firstName);
      const campaignTitle = asScalarString(p.campaignTitle, 'Your campaign');
      const customerVisibleReason = asScalarString(
        p.customerVisibleReason,
        'Your campaign was not approved. Please update it and resubmit.',
      );
      return {
        template: 'organizer-campaign-rejected',
        subject: 'Update on your campaign review',
        context: { firstName, campaignTitle, customerVisibleReason },
      };
    }
    case OUTBOX_EVENT_ORGANIZER_CAMPAIGN_RESUMED: {
      const firstName = asScalarString(p.firstName);
      const campaignTitle = asScalarString(p.campaignTitle, 'Your campaign');
      return {
        template: 'organizer-campaign-resumed',
        subject: 'Your campaign was resumed',
        context: { firstName, campaignTitle },
      };
    }

    default:
      return null;
  }
}
