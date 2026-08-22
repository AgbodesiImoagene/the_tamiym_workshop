import {
  NotificationCategory,
  NotificationChannel,
  NotificationPreferenceChannel,
} from '../generated/prisma/enums';
import {
  buildNotificationEffectKey,
  classifyNotificationEvent,
  evaluateNotificationPolicy,
  NotificationDecisionCode,
  NOTIFICATION_POLICY_VERSION,
} from './notification-policy';
import {
  OUTBOX_EVENT_ADMIN_BROADCAST,
  OUTBOX_EVENT_ADMIN_OPERATIONAL,
  OUTBOX_EVENT_ORGANIZER_CAMPAIGN_APPROVED,
  OUTBOX_EVENT_PAYMENT_CONFIRMED,
} from '../mail/mail-outbox-templates';
import {
  categoryRequiresMarketingConsent,
  isPreferenceCategoryMutable,
  toPreferenceChannel,
} from './notification-policy';

describe('notification-policy', () => {
  it('classifies transactional events as required', () => {
    const entry = classifyNotificationEvent(OUTBOX_EVENT_PAYMENT_CONFIRMED);
    expect(entry?.category).toBe(NotificationCategory.TRANSACTIONAL);
    expect(entry?.required).toBe(true);
  });

  it('classifies admin broadcast as marketing', () => {
    const entry = classifyNotificationEvent(OUTBOX_EVENT_ADMIN_BROADCAST);
    expect(entry?.category).toBe(NotificationCategory.MARKETING);
    expect(entry?.requiresMarketingConsent).toBe(true);
  });

  it('queues required transactional notices even when preference disabled', () => {
    const result = evaluateNotificationPolicy({
      eventName: OUTBOX_EVENT_PAYMENT_CONFIRMED,
      channel: NotificationChannel.EMAIL,
      recipient: 'a@example.com',
      recipientUserId: 'u1',
      preference: { enabled: false },
    });
    expect(result.queue).toBe(true);
    expect(result.decisionCode).toBe(NotificationDecisionCode.REQUIRED);
  });

  it('suppresses marketing without consent', () => {
    const result = evaluateNotificationPolicy({
      eventName: OUTBOX_EVENT_ADMIN_BROADCAST,
      channel: NotificationChannel.EMAIL,
      recipient: 'a@example.com',
      recipientUserId: 'u1',
      marketingConsent: { granted: false },
    });
    expect(result.suppressed).toBe(true);
    expect(result.decisionCode).toBe(NotificationDecisionCode.MISSING_CONSENT);
  });

  it('builds stable effect keys from dedupe key', () => {
    expect(
      buildNotificationEffectKey({
        eventName: OUTBOX_EVENT_PAYMENT_CONFIRMED,
        channel: NotificationChannel.EMAIL,
        recipient: 'a@example.com',
        dedupeKey: 'PaymentConfirmed:order-1',
      }),
    ).toBe('PaymentConfirmed:order-1');
  });

  it('uses policy version constant', () => {
    expect(NOTIFICATION_POLICY_VERSION).toContain('notification-delivery');
  });

  it('maps email channel to preference channel', () => {
    const result = evaluateNotificationPolicy({
      eventName: OUTBOX_EVENT_ADMIN_BROADCAST,
      channel: NotificationChannel.EMAIL,
      recipient: 'a@example.com',
      recipientUserId: 'u1',
      preference: { enabled: true },
      marketingConsent: { granted: true },
    });
    expect(result.queue).toBe(true);
    expect(result.category).toBe(NotificationCategory.MARKETING);
    expect(NotificationPreferenceChannel.EMAIL).toBe('EMAIL');
  });

  it('classifies admin operational as required without preferences', () => {
    const entry = classifyNotificationEvent(OUTBOX_EVENT_ADMIN_OPERATIONAL);
    expect(entry?.required).toBe(true);
    expect(entry?.preferenceApplies).toBe(false);
  });

  it('classifies organiser operational with preference gates', () => {
    const entry = classifyNotificationEvent(
      OUTBOX_EVENT_ORGANIZER_CAMPAIGN_APPROVED,
    );
    expect(entry?.category).toBe(NotificationCategory.ORGANISER_OPERATIONAL);
    expect(entry?.preferenceApplies).toBe(true);
  });

  it('suppresses unmapped taxonomy', () => {
    const result = evaluateNotificationPolicy({
      eventName: 'UnknownEvent',
      channel: NotificationChannel.EMAIL,
      recipient: 'a@example.com',
    });
    expect(result.decisionCode).toBe(
      NotificationDecisionCode.TAXONOMY_UNMAPPED,
    );
  });

  it('suppresses missing recipient', () => {
    const result = evaluateNotificationPolicy({
      eventName: OUTBOX_EVENT_ORGANIZER_CAMPAIGN_APPROVED,
      channel: NotificationChannel.EMAIL,
      recipient: '   ',
    });
    expect(result.decisionCode).toBe(
      NotificationDecisionCode.RECIPIENT_MISSING,
    );
  });

  it('suppresses organiser operational when opted out', () => {
    const result = evaluateNotificationPolicy({
      eventName: OUTBOX_EVENT_ORGANIZER_CAMPAIGN_APPROVED,
      channel: NotificationChannel.EMAIL,
      recipient: 'a@example.com',
      recipientUserId: 'u1',
      preference: { enabled: false },
    });
    expect(result.decisionCode).toBe(NotificationDecisionCode.OPTED_OUT);
  });

  it('maps sms channel and unknown channels for preferences', () => {
    expect(toPreferenceChannel(NotificationChannel.SMS)).toBe(
      NotificationPreferenceChannel.SMS,
    );
    expect(toPreferenceChannel('PUSH' as NotificationChannel)).toBeNull();
  });

  it('identifies mutable preference categories and marketing consent', () => {
    expect(isPreferenceCategoryMutable(NotificationCategory.MARKETING)).toBe(
      true,
    );
    expect(
      categoryRequiresMarketingConsent(NotificationCategory.MARKETING),
    ).toBe(true);
  });
});
