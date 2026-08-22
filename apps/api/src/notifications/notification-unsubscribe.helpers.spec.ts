import {
  NotificationCategory,
  NotificationPreferenceChannel,
} from '../generated/prisma/enums';
import {
  signNotificationUnsubscribeToken,
  verifyNotificationUnsubscribeToken,
} from './notification-unsubscribe.helpers';

describe('notification-unsubscribe.helpers', () => {
  const secret = 'test-secret';

  it('round-trips a valid token', () => {
    const token = signNotificationUnsubscribeToken(
      {
        userId: 'user-1',
        category: NotificationCategory.MARKETING,
        channel: NotificationPreferenceChannel.EMAIL,
        exp: Date.now() + 60_000,
      },
      secret,
    );
    const payload = verifyNotificationUnsubscribeToken(token, secret);
    expect(payload?.userId).toBe('user-1');
  });

  it('rejects expired tokens', () => {
    const token = signNotificationUnsubscribeToken(
      {
        userId: 'user-1',
        category: NotificationCategory.MARKETING,
        channel: NotificationPreferenceChannel.EMAIL,
        exp: Date.now() - 1,
      },
      secret,
    );
    expect(verifyNotificationUnsubscribeToken(token, secret)).toBeNull();
  });
});
