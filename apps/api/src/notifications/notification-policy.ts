/**
 * TTW-043 slice 1 — pure notification policy / taxonomy evaluator.
 * Policy: docs/notifications/ttw-043-interim-policy.md
 */

import {
  NotificationCategory,
  NotificationChannel,
  NotificationPreferenceChannel,
  NotificationSuppressionReason,
} from '../generated/prisma/enums';
import {
  OUTBOX_EVENT_ADMIN_BROADCAST,
  OUTBOX_EVENT_ADMIN_OPERATIONAL,
  OUTBOX_EVENT_DESIGN_MODERATION_APPROVED,
  OUTBOX_EVENT_DESIGN_MODERATION_REJECTED,
  OUTBOX_EVENT_ORDER_CANCELLED_CUSTOMER,
  OUTBOX_EVENT_ORDER_DELIVERED,
  OUTBOX_EVENT_ORDER_FULFILLED,
  OUTBOX_EVENT_ORDER_PLACED,
  OUTBOX_EVENT_ORDER_PROCESSING,
  OUTBOX_EVENT_ORGANIZER_APPLICATION_APPROVED,
  OUTBOX_EVENT_ORGANIZER_APPLICATION_REJECTED,
  OUTBOX_EVENT_ORGANIZER_CAMPAIGN_APPROVED,
  OUTBOX_EVENT_ORGANIZER_CAMPAIGN_REJECTED,
  OUTBOX_EVENT_ORGANIZER_CAMPAIGN_RESUMED,
  OUTBOX_EVENT_ORGANIZER_PAYOUT_FAILED,
  OUTBOX_EVENT_ORGANIZER_PAYOUT_SUCCEEDED,
  OUTBOX_EVENT_PAYMENT_CONFIRMED,
  OUTBOX_EVENT_REFUND_COMPLETED,
} from '../mail/mail-outbox-templates';

export const NOTIFICATION_POLICY_VERSION =
  'notification-delivery/v1-interim-2026-08-21';

export const NotificationDecisionCode = {
  QUEUED: 'NOTIFICATION_QUEUED',
  REQUIRED: 'NOTIFICATION_REQUIRED',
  OPTED_OUT: 'NOTIFICATION_OPTED_OUT',
  MISSING_CONSENT: 'NOTIFICATION_MISSING_CONSENT',
  TAXONOMY_UNMAPPED: 'NOTIFICATION_TAXONOMY_UNMAPPED',
  RECIPIENT_MISSING: 'NOTIFICATION_RECIPIENT_MISSING',
} as const;

export type NotificationDecisionCode =
  (typeof NotificationDecisionCode)[keyof typeof NotificationDecisionCode];

export type NotificationTaxonomyEntry = {
  category: NotificationCategory;
  required: boolean;
  /** When false, preference/consent gates are skipped (ops/admin fan-out). */
  preferenceApplies: boolean;
  /** When true, explicit marketing consent must exist before queueing. */
  requiresMarketingConsent: boolean;
};

const TRANSACTIONAL_EVENTS = new Set<string>([
  OUTBOX_EVENT_ORDER_PLACED,
  OUTBOX_EVENT_PAYMENT_CONFIRMED,
  OUTBOX_EVENT_ORDER_PROCESSING,
  OUTBOX_EVENT_ORDER_FULFILLED,
  OUTBOX_EVENT_ORDER_DELIVERED,
  OUTBOX_EVENT_ORDER_CANCELLED_CUSTOMER,
  OUTBOX_EVENT_REFUND_COMPLETED,
  OUTBOX_EVENT_DESIGN_MODERATION_APPROVED,
  OUTBOX_EVENT_DESIGN_MODERATION_REJECTED,
  OUTBOX_EVENT_ORGANIZER_PAYOUT_SUCCEEDED,
  OUTBOX_EVENT_ORGANIZER_PAYOUT_FAILED,
]);

const ORGANISER_OPERATIONAL_EVENTS = new Set<string>([
  OUTBOX_EVENT_ORGANIZER_APPLICATION_APPROVED,
  OUTBOX_EVENT_ORGANIZER_APPLICATION_REJECTED,
  OUTBOX_EVENT_ORGANIZER_CAMPAIGN_APPROVED,
  OUTBOX_EVENT_ORGANIZER_CAMPAIGN_REJECTED,
  OUTBOX_EVENT_ORGANIZER_CAMPAIGN_RESUMED,
]);

const MARKETING_EVENTS = new Set<string>([OUTBOX_EVENT_ADMIN_BROADCAST]);

const REQUIRED_OPS_EVENTS = new Set<string>([OUTBOX_EVENT_ADMIN_OPERATIONAL]);

export function classifyNotificationEvent(
  eventName: string,
): NotificationTaxonomyEntry | null {
  if (REQUIRED_OPS_EVENTS.has(eventName)) {
    return {
      category: NotificationCategory.ORGANISER_OPERATIONAL,
      required: true,
      preferenceApplies: false,
      requiresMarketingConsent: false,
    };
  }
  if (TRANSACTIONAL_EVENTS.has(eventName)) {
    return {
      category: NotificationCategory.TRANSACTIONAL,
      required: true,
      preferenceApplies: false,
      requiresMarketingConsent: false,
    };
  }
  if (ORGANISER_OPERATIONAL_EVENTS.has(eventName)) {
    return {
      category: NotificationCategory.ORGANISER_OPERATIONAL,
      required: false,
      preferenceApplies: true,
      requiresMarketingConsent: false,
    };
  }
  if (MARKETING_EVENTS.has(eventName)) {
    return {
      category: NotificationCategory.MARKETING,
      required: false,
      preferenceApplies: true,
      requiresMarketingConsent: true,
    };
  }
  return null;
}

export function toPreferenceChannel(
  channel: NotificationChannel,
): NotificationPreferenceChannel | null {
  switch (channel) {
    case NotificationChannel.EMAIL:
      return NotificationPreferenceChannel.EMAIL;
    case NotificationChannel.SMS:
      return NotificationPreferenceChannel.SMS;
    default:
      return null;
  }
}

export type NotificationPreferenceState = {
  enabled: boolean;
};

export type NotificationConsentState = {
  granted: boolean;
};

export type EvaluateNotificationPolicyInput = {
  eventName: string;
  channel: NotificationChannel;
  recipient?: string | null;
  recipientUserId?: string | null;
  preference?: NotificationPreferenceState | null;
  marketingConsent?: NotificationConsentState | null;
};

export type NotificationPolicyEvaluation = {
  policyVersion: string;
  taxonomy: NotificationTaxonomyEntry | null;
  queue: boolean;
  suppressed: boolean;
  decisionCode: NotificationDecisionCode;
  suppressionReason: NotificationSuppressionReason | null;
  category: NotificationCategory | null;
};

export function buildNotificationEffectKey(args: {
  eventName: string;
  channel: NotificationChannel;
  recipient: string;
  recipientUserId?: string | null;
  dedupeKey?: string | null;
}): string {
  if (args.dedupeKey?.trim()) {
    return args.dedupeKey.trim();
  }
  const scope = args.recipientUserId?.trim() || args.recipient.trim();
  return `${args.eventName}:${scope}:${args.channel}`;
}

export function evaluateNotificationPolicy(
  input: EvaluateNotificationPolicyInput,
): NotificationPolicyEvaluation {
  const taxonomy = classifyNotificationEvent(input.eventName);
  if (!taxonomy) {
    return {
      policyVersion: NOTIFICATION_POLICY_VERSION,
      taxonomy: null,
      queue: false,
      suppressed: true,
      decisionCode: NotificationDecisionCode.TAXONOMY_UNMAPPED,
      suppressionReason: NotificationSuppressionReason.TAXONOMY_UNMAPPED,
      category: null,
    };
  }

  if (!input.recipient?.trim()) {
    return {
      policyVersion: NOTIFICATION_POLICY_VERSION,
      taxonomy,
      queue: false,
      suppressed: true,
      decisionCode: NotificationDecisionCode.RECIPIENT_MISSING,
      suppressionReason: NotificationSuppressionReason.RECIPIENT_MISSING,
      category: taxonomy.category,
    };
  }

  if (taxonomy.required || !taxonomy.preferenceApplies) {
    return {
      policyVersion: NOTIFICATION_POLICY_VERSION,
      taxonomy,
      queue: true,
      suppressed: false,
      decisionCode: NotificationDecisionCode.REQUIRED,
      suppressionReason: null,
      category: taxonomy.category,
    };
  }

  const preferenceChannel = toPreferenceChannel(input.channel);
  if (preferenceChannel && input.preference && !input.preference.enabled) {
    return {
      policyVersion: NOTIFICATION_POLICY_VERSION,
      taxonomy,
      queue: false,
      suppressed: true,
      decisionCode: NotificationDecisionCode.OPTED_OUT,
      suppressionReason: NotificationSuppressionReason.PREFERENCE_OPT_OUT,
      category: taxonomy.category,
    };
  }

  if (
    taxonomy.requiresMarketingConsent &&
    (!input.marketingConsent || !input.marketingConsent.granted)
  ) {
    return {
      policyVersion: NOTIFICATION_POLICY_VERSION,
      taxonomy,
      queue: false,
      suppressed: true,
      decisionCode: NotificationDecisionCode.MISSING_CONSENT,
      suppressionReason: NotificationSuppressionReason.MISSING_CONSENT,
      category: taxonomy.category,
    };
  }

  return {
    policyVersion: NOTIFICATION_POLICY_VERSION,
    taxonomy,
    queue: true,
    suppressed: false,
    decisionCode: NotificationDecisionCode.QUEUED,
    suppressionReason: null,
    category: taxonomy.category,
  };
}

export const OPTIONAL_PREFERENCE_CATEGORIES: NotificationCategory[] = [
  NotificationCategory.ORGANISER_OPERATIONAL,
  NotificationCategory.MARKETING,
];

export function isPreferenceCategoryMutable(
  category: NotificationCategory,
): boolean {
  return OPTIONAL_PREFERENCE_CATEGORIES.includes(category);
}

export function categoryRequiresMarketingConsent(
  category: NotificationCategory,
): boolean {
  return category === NotificationCategory.MARKETING;
}
