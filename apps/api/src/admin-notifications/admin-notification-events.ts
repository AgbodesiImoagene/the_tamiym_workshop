/** Logical keys for `AdminNotificationRoute.eventKey` and `AdminNotifyService.emit`. */

export const ADMIN_NOTIF_ORDER_PLACED = 'admin.order.placed';
export const ADMIN_NOTIF_ORDER_STATUS_CHANGED = 'admin.order.status_changed';
export const ADMIN_NOTIF_PAYMENT_CONFIRMED = 'admin.payment.confirmed';
export const ADMIN_NOTIF_REFUND_COMPLETED = 'admin.refund.completed';
/**
 * Paystack captured money for an order that was already cancelled or expired.
 * The customer was charged but the order is closed — manual refund required.
 */
export const ADMIN_NOTIF_PAYMENT_CAPTURED_CANCELLED_ORDER =
  'admin.payment.captured_on_cancelled_order';
export const ADMIN_NOTIF_DESIGN_SUBMITTED = 'admin.design.submitted';
export const ADMIN_NOTIF_DESIGN_MODERATION_UPDATED =
  'admin.design.moderation.updated';
export const ADMIN_NOTIF_PAYOUT_SUCCEEDED = 'admin.payout.succeeded';
export const ADMIN_NOTIF_PAYOUT_FAILED = 'admin.payout.failed';

export const ADMIN_NOTIF_INVENTORY_LOW = 'admin.inventory.low';
/** Sellable quantity crossed from above 0 to zero or below. */
export const ADMIN_NOTIF_INVENTORY_OUT_OF_STOCK =
  'admin.inventory.out_of_stock';
/**
 * Optional middle tier: set `LOW_INVENTORY_CRITICAL_THRESHOLD` (e.g. 3). One notify when
 * available crosses from above that value to at or below it (OOS is notified instead if both apply).
 */
export const ADMIN_NOTIF_INVENTORY_CRITICAL = 'admin.inventory.critical';

/** Cron batched: unpaid checkout sessions timed out (inventory released). */
export const ADMIN_NOTIF_ORDER_PENDING_EXPIRED = 'admin.order.pending_expired';

export const ADMIN_NOTIF_CAMPAIGN_SUBMITTED_FOR_REVIEW =
  'admin.campaign.submitted_for_review';
/** AI sent campaign back to DRAFT (content policy). */
export const ADMIN_NOTIF_CAMPAIGN_AI_AUTO_REJECTED =
  'admin.campaign.ai_auto_rejected';
export const ADMIN_NOTIF_CAMPAIGN_ACTIVATED = 'admin.campaign.activated';
export const ADMIN_NOTIF_CAMPAIGN_REJECTED_BY_ADMIN =
  'admin.campaign.rejected_by_admin';
/** PAUSED, ENDED, DISABLED, etc. (not activate/reject/review flow). */
export const ADMIN_NOTIF_CAMPAIGN_STATUS_CHANGED =
  'admin.campaign.status_changed';

/** Reconciliation run finished with open findings or incomplete/failed status (TTW-015). */
export const ADMIN_NOTIF_RECONCILIATION_RUN = 'admin.reconciliation.run';

export const ADMIN_NOTIFICATION_EVENT_CATALOG: {
  key: string;
  description: string;
}[] = [
  {
    key: ADMIN_NOTIF_ORDER_PLACED,
    description: 'New order created (standard or campaign checkout).',
  },
  {
    key: ADMIN_NOTIF_ORDER_STATUS_CHANGED,
    description: 'Admin changed order status (fulfillment pipeline).',
  },
  {
    key: ADMIN_NOTIF_PAYMENT_CONFIRMED,
    description: 'Paystack charge succeeded; order marked paid.',
  },
  {
    key: ADMIN_NOTIF_PAYMENT_CAPTURED_CANCELLED_ORDER,
    description:
      'Paystack charge succeeded but the order was already cancelled or expired. Customer was charged — manual refund required.',
  },
  {
    key: ADMIN_NOTIF_REFUND_COMPLETED,
    description: 'Admin refund completed via Paystack.',
  },
  {
    key: ADMIN_NOTIF_DESIGN_SUBMITTED,
    description: 'Customer saved a new design (any moderation outcome).',
  },
  {
    key: ADMIN_NOTIF_DESIGN_MODERATION_UPDATED,
    description:
      'Admin set design moderation to APPROVED, REJECTED, or FLAGGED.',
  },
  {
    key: ADMIN_NOTIF_PAYOUT_SUCCEEDED,
    description: 'Organizer payout transfer succeeded (webhook).',
  },
  {
    key: ADMIN_NOTIF_PAYOUT_FAILED,
    description: 'Organizer payout transfer failed (webhook).',
  },
  {
    key: ADMIN_NOTIF_INVENTORY_LOW,
    description:
      'Sellable quantity crossed into at or below the variant lowStockThreshold (only when that field is set positive on the row). If it is 0, use critical env and/or OOS only.',
  },
  {
    key: ADMIN_NOTIF_INVENTORY_CRITICAL,
    description:
      'Optional: crossed into at or below LOW_INVENTORY_CRITICAL_THRESHOLD (env). Skipped if unset. Less severe than OOS, more severe than per-variant low.',
  },
  {
    key: ADMIN_NOTIF_INVENTORY_OUT_OF_STOCK,
    description:
      'Sellable quantity crossed from above 0 to zero or below (tracked inventory).',
  },
  {
    key: ADMIN_NOTIF_ORDER_PENDING_EXPIRED,
    description:
      'Scheduled job cancelled one or more PENDING_PAYMENT orders past expiresAt (checkout abandoned).',
  },
  {
    key: ADMIN_NOTIF_CAMPAIGN_SUBMITTED_FOR_REVIEW,
    description:
      'Organiser submitted a DRAFT campaign; it is in REVIEW (AI pre-screen APPROVED or FLAGGED).',
  },
  {
    key: ADMIN_NOTIF_CAMPAIGN_AI_AUTO_REJECTED,
    description:
      'AI rejected campaign text on submit; campaign returned to DRAFT for organiser to fix.',
  },
  {
    key: ADMIN_NOTIF_CAMPAIGN_ACTIVATED,
    description: 'Admin activated a REVIEW campaign (now live).',
  },
  {
    key: ADMIN_NOTIF_CAMPAIGN_REJECTED_BY_ADMIN,
    description:
      'Admin rejected a REVIEW campaign back to DRAFT with a reason.',
  },
  {
    key: ADMIN_NOTIF_CAMPAIGN_STATUS_CHANGED,
    description:
      'Admin changed campaign status (e.g. PAUSED, ENDED) via status update — not activate/reject.',
  },
  {
    key: ADMIN_NOTIF_RECONCILIATION_RUN,
    description:
      'Nightly/daily reconciliation finished with open findings or incomplete/failed status (TTW-015).',
  },
];
