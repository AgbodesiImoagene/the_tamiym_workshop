import {
  DEFAULT_NOTIFICATION_SLO,
  isPendingAgeBreach,
  parseNotificationSloConfig,
} from './notification-slo.helpers';

describe('notification-slo.helpers', () => {
  it('parses env overrides', () => {
    const slo = parseNotificationSloConfig({
      NOTIFICATION_SLO_PENDING_MAX_AGE_MINUTES: 45,
    });
    expect(slo.pendingMaxAgeMinutes).toBe(45);
  });

  it('detects pending age breach', () => {
    expect(isPendingAgeBreach(31 * 60, DEFAULT_NOTIFICATION_SLO)).toBe(true);
  });
});
