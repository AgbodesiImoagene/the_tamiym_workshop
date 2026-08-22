/**
 * TTW-043: delivery SLO helpers for metrics/alerts.
 */

export type NotificationSloConfig = {
  pendingMaxAgeMinutes: number;
  deliveryMaxMinutes: number;
  failureRatePercent: number;
  deadLetterAckMaxHours: number;
};

export const DEFAULT_NOTIFICATION_SLO: NotificationSloConfig = {
  pendingMaxAgeMinutes: 30,
  deliveryMaxMinutes: 15,
  failureRatePercent: 5,
  deadLetterAckMaxHours: 24,
};

export function parseNotificationSloConfig(
  config: Record<string, unknown>,
): NotificationSloConfig {
  const readNumber = (key: string, fallback: number) => {
    const raw = config[key];
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    pendingMaxAgeMinutes: readNumber(
      'NOTIFICATION_SLO_PENDING_MAX_AGE_MINUTES',
      DEFAULT_NOTIFICATION_SLO.pendingMaxAgeMinutes,
    ),
    deliveryMaxMinutes: readNumber(
      'NOTIFICATION_SLO_DELIVERY_MAX_MINUTES',
      DEFAULT_NOTIFICATION_SLO.deliveryMaxMinutes,
    ),
    failureRatePercent: readNumber(
      'NOTIFICATION_SLO_FAILURE_RATE_PERCENT',
      DEFAULT_NOTIFICATION_SLO.failureRatePercent,
    ),
    deadLetterAckMaxHours: readNumber(
      'NOTIFICATION_SLO_DEAD_LETTER_ACK_MAX_HOURS',
      DEFAULT_NOTIFICATION_SLO.deadLetterAckMaxHours,
    ),
  };
}

export function isPendingAgeBreach(
  oldestPendingAgeSeconds: number,
  slo: NotificationSloConfig,
): boolean {
  return oldestPendingAgeSeconds > slo.pendingMaxAgeMinutes * 60;
}

export function isDeliveryLatencyBreach(
  latencyMinutes: number,
  slo: NotificationSloConfig,
): boolean {
  return latencyMinutes > slo.deliveryMaxMinutes;
}

export function isFailureRateBreach(
  failurePercent: number,
  slo: NotificationSloConfig,
): boolean {
  return failurePercent > slo.failureRatePercent;
}

export function isDeadLetterAckAgeBreach(
  ageHours: number,
  slo: NotificationSloConfig,
): boolean {
  return ageHours > slo.deadLetterAckMaxHours;
}
