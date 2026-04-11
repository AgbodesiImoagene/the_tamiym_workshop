import {
  ADMIN_NOTIF_CAMPAIGN_ACTIVATED,
  ADMIN_NOTIF_CAMPAIGN_AI_AUTO_REJECTED,
  ADMIN_NOTIF_CAMPAIGN_REJECTED_BY_ADMIN,
  ADMIN_NOTIF_CAMPAIGN_STATUS_CHANGED,
  ADMIN_NOTIF_CAMPAIGN_SUBMITTED_FOR_REVIEW,
  ADMIN_NOTIF_DESIGN_MODERATION_UPDATED,
  ADMIN_NOTIF_DESIGN_SUBMITTED,
  ADMIN_NOTIF_INVENTORY_CRITICAL,
  ADMIN_NOTIF_INVENTORY_LOW,
  ADMIN_NOTIF_INVENTORY_OUT_OF_STOCK,
  ADMIN_NOTIF_ORDER_PENDING_EXPIRED,
  ADMIN_NOTIF_ORDER_PLACED,
  ADMIN_NOTIF_ORDER_STATUS_CHANGED,
  ADMIN_NOTIF_PAYMENT_CONFIRMED,
  ADMIN_NOTIF_PAYOUT_FAILED,
  ADMIN_NOTIF_PAYOUT_SUCCEEDED,
  ADMIN_NOTIF_REFUND_COMPLETED,
} from './admin-notification-events';

export interface AdminNotificationTemplateDefaults {
  subject: string;
  emailBody: string;
  smsBody: string;
}

/** Built-in Handlebars templates when route overrides are null. */
export const ADMIN_NOTIFICATION_DEFAULTS: Record<
  string,
  AdminNotificationTemplateDefaults
> = {
  [ADMIN_NOTIF_ORDER_PLACED]: {
    subject: 'New order {{orderId}}',
    emailBody: `<p><strong>New order</strong></p>
<p>Order: <code>{{orderId}}</code></p>
<p>Total: {{formatAmount totalAmount currency}}</p>
<p>Buyer user: <code>{{userId}}</code>{{#if campaignId}}<br/>Campaign: <code>{{campaignId}}</code>{{/if}}</p>`,
    smsBody:
      'New order {{orderId}} total {{formatAmount totalAmount currency}}',
  },
  [ADMIN_NOTIF_ORDER_STATUS_CHANGED]: {
    subject: 'Order {{orderId}} → {{newStatus}}',
    emailBody: `<p>Order <code>{{orderId}}</code> status changed from <strong>{{previousStatus}}</strong> to <strong>{{newStatus}}</strong>.</p>
{{#if actorUserId}}<p>Actor: <code>{{actorUserId}}</code></p>{{/if}}`,
    smsBody: 'Order {{orderId}}: {{previousStatus}} → {{newStatus}}',
  },
  [ADMIN_NOTIF_PAYMENT_CONFIRMED]: {
    subject: 'Payment confirmed {{orderId}}',
    emailBody: `<p>Payment succeeded for order <code>{{orderId}}</code>.</p>
<p>Amount: {{formatAmount amount currency}}</p>
<p>Reference: <code>{{reference}}</code></p>`,
    smsBody:
      'Paid {{orderId}} {{formatAmount amount currency}} ref {{reference}}',
  },
  [ADMIN_NOTIF_REFUND_COMPLETED]: {
    subject: 'Refund {{orderId}}',
    emailBody: `<p>Refund completed for order <code>{{orderId}}</code>.</p>
<p>Amount: {{formatAmount amount currency}}</p>
{{#if reason}}<p>Reason: {{reason}}</p>{{/if}}
<p>Refund id: <code>{{refundId}}</code></p>`,
    smsBody: 'Refund {{orderId}} {{formatAmount amount currency}}',
  },
  [ADMIN_NOTIF_DESIGN_SUBMITTED]: {
    subject: 'Design submitted {{designId}}',
    emailBody: `<p>New design <strong>{{designName}}</strong> on {{productName}}.</p>
<p>Design: <code>{{designId}}</code> · Owner: <code>{{userId}}</code></p>
<p>Auto-moderation status: <strong>{{moderationStatus}}</strong></p>`,
    smsBody: 'Design {{designId}} {{designName}} ({{moderationStatus}})',
  },
  [ADMIN_NOTIF_DESIGN_MODERATION_UPDATED]: {
    subject: 'Design {{designId}} → {{status}}',
    emailBody: `<p>Design <strong>{{designName}}</strong> set to <strong>{{status}}</strong>.</p>
<p>Design: <code>{{designId}}</code>{{#if ownerEmail}} · {{ownerEmail}}{{/if}}</p>
{{#if notes}}<p>Notes: {{notes}}</p>{{/if}}`,
    smsBody: 'Design {{designId}} moderation {{status}}',
  },
  [ADMIN_NOTIF_PAYOUT_SUCCEEDED]: {
    subject: 'Payout OK {{payoutId}}',
    emailBody: `<p>Payout <code>{{payoutId}}</code> succeeded.</p>
<p>Campaign: {{campaignTitle}}</p>
<p>Amount: {{formatAmount amount currency}}</p>
{{#if recipientEmail}}<p>Recipient: {{recipientEmail}}</p>{{/if}}`,
    smsBody:
      'Payout ok {{payoutId}} {{formatAmount amount currency}} {{campaignTitle}}',
  },
  [ADMIN_NOTIF_PAYOUT_FAILED]: {
    subject: 'Payout FAILED {{payoutId}}',
    emailBody: `<p>Payout <code>{{payoutId}}</code> <strong>failed</strong>.</p>
<p>Campaign: {{campaignTitle}}</p>
<p>Amount: {{formatAmount amount currency}}</p>
{{#if failureReason}}<p>{{failureReason}}</p>{{/if}}`,
    smsBody: 'Payout FAIL {{payoutId}} {{campaignTitle}}',
  },
  [ADMIN_NOTIF_INVENTORY_LOW]: {
    subject:
      'Low stock: {{variantName}} (avail {{available}}, threshold {{threshold}})',
    emailBody: `<p><strong>Low inventory</strong> (crossed at or below variant threshold)</p>
<p>Variant: <code>{{variantId}}</code> {{variantName}}{{#if sku}} · SKU {{sku}}{{/if}}</p>
<p>Product: {{productName}} <code>{{productId}}</code></p>
<p>Available: <strong>{{available}}</strong> (threshold {{threshold}}, was {{previousAvailable}}, on hand {{stockOnHand}}, reserved {{reserved}})</p>`,
    smsBody:
      'Low stock {{sku}} avail {{available}} thresh {{threshold}} variant {{variantId}}',
  },
  [ADMIN_NOTIF_INVENTORY_CRITICAL]: {
    subject:
      'Critical stock: {{variantName}} (avail {{available}} ≤ {{criticalThreshold}})',
    emailBody: `<p><strong>Critical inventory</strong> (crossed at or below site critical level)</p>
<p>Variant: <code>{{variantId}}</code> {{variantName}}{{#if sku}} · SKU {{sku}}{{/if}}</p>
<p>Product: {{productName}} <code>{{productId}}</code></p>
<p>Available: <strong>{{available}}</strong> (critical ≤ {{criticalThreshold}}, was {{previousAvailable}})</p>`,
    smsBody:
      'Critical stock {{variantId}} avail {{available}} max {{criticalThreshold}}',
  },
  [ADMIN_NOTIF_INVENTORY_OUT_OF_STOCK]: {
    subject: 'OUT OF STOCK: {{variantName}}',
    emailBody: `<p><strong>Out of stock</strong> (sellable quantity at or below zero)</p>
<p>Variant: <code>{{variantId}}</code> {{variantName}}{{#if sku}} · SKU {{sku}}{{/if}}</p>
<p>Product: {{productName}} <code>{{productId}}</code></p>
<p>Available: <strong>{{available}}</strong> (on hand {{stockOnHand}}, reserved {{reserved}}, was {{previousAvailable}})</p>`,
    smsBody: 'OOS variant {{variantId}} {{sku}} avail {{available}}',
  },
  [ADMIN_NOTIF_ORDER_PENDING_EXPIRED]: {
    subject: 'Expired checkouts: {{count}} order(s)',
    emailBody: `<p><strong>{{count}}</strong> pending payment order(s) were cancelled (checkout expired).</p>
{{#if orderIdsPreview}}<p>IDs: <code>{{orderIdsPreview}}</code></p>{{/if}}`,
    smsBody: 'Expired {{count}} unpaid checkout(s)',
  },
  [ADMIN_NOTIF_CAMPAIGN_SUBMITTED_FOR_REVIEW]: {
    subject: 'Campaign review: {{campaignTitle}}',
    emailBody: `<p>Campaign <strong>{{campaignTitle}}</strong> submitted for review.</p>
<p>ID: <code>{{campaignId}}</code> · Organiser: <code>{{organizerId}}</code></p>
<p>AI pre-screen: <strong>{{aiModerationStatus}}</strong></p>`,
    smsBody:
      'Campaign review {{campaignId}} {{campaignTitle}} AI {{aiModerationStatus}}',
  },
  [ADMIN_NOTIF_CAMPAIGN_AI_AUTO_REJECTED]: {
    subject: 'Campaign AI-rejected {{campaignTitle}}',
    emailBody: `<p>Campaign <strong>{{campaignTitle}}</strong> was <strong>auto-rejected</strong> by AI and returned to DRAFT.</p>
<p>ID: <code>{{campaignId}}</code> · Organiser: <code>{{organizerId}}</code></p>
{{#if moderationNotes}}<p>Notes: {{moderationNotes}}</p>{{/if}}`,
    smsBody: 'Campaign AI reject {{campaignId}} {{campaignTitle}}',
  },
  [ADMIN_NOTIF_CAMPAIGN_ACTIVATED]: {
    subject: 'Campaign live: {{campaignTitle}}',
    emailBody: `<p>Campaign <strong>{{campaignTitle}}</strong> was <strong>activated</strong>.</p>
<p>ID: <code>{{campaignId}}</code></p>
{{#if actorUserId}}<p>Actor: <code>{{actorUserId}}</code></p>{{/if}}`,
    smsBody: 'Campaign live {{campaignId}} {{campaignTitle}}',
  },
  [ADMIN_NOTIF_CAMPAIGN_REJECTED_BY_ADMIN]: {
    subject: 'Campaign rejected: {{campaignTitle}}',
    emailBody: `<p>Campaign <strong>{{campaignTitle}}</strong> was rejected to DRAFT.</p>
<p>ID: <code>{{campaignId}}</code></p>
<p>Reason: {{rejectionReason}}</p>
{{#if notes}}<p>Internal notes: {{notes}}</p>{{/if}}
{{#if actorUserId}}<p>Actor: <code>{{actorUserId}}</code></p>{{/if}}`,
    smsBody: 'Campaign rejected {{campaignId}} {{campaignTitle}}',
  },
  [ADMIN_NOTIF_CAMPAIGN_STATUS_CHANGED]: {
    subject: 'Campaign {{campaignId}}: {{previousStatus}} → {{newStatus}}',
    emailBody: `<p>Campaign <strong>{{campaignTitle}}</strong> status changed.</p>
<p>ID: <code>{{campaignId}}</code></p>
<p><strong>{{previousStatus}}</strong> → <strong>{{newStatus}}</strong></p>
{{#if actorUserId}}<p>Actor: <code>{{actorUserId}}</code></p>{{/if}}`,
    smsBody: 'Campaign {{campaignId}} {{previousStatus}}→{{newStatus}}',
  },
};
