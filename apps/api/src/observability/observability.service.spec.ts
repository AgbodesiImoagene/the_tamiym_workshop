import { ObservabilityService } from './observability.service';

describe('ObservabilityService', () => {
  it('records charge settlement outcomes', () => {
    const service = new ObservabilityService();
    expect(() => service.recordChargeSettlement('settled')).not.toThrow();
    expect(() => service.recordChargeSettlement('duplicate')).not.toThrow();
    expect(() => service.recordChargeSettlement('rejected')).not.toThrow();
    expect(() =>
      service.recordInventoryMovement('consume', 'applied'),
    ).not.toThrow();
  });

  it('records payout transfer event outcomes', () => {
    const service = new ObservabilityService();
    expect(() => service.recordPayoutTransferEvent('applied')).not.toThrow();
    expect(() => service.recordPayoutTransferEvent('duplicate')).not.toThrow();
    expect(() => service.recordPayoutTransferEvent('stale')).not.toThrow();
  });

  it('records payment initiation outcomes', () => {
    const service = new ObservabilityService();
    expect(() =>
      service.recordPaymentInitiation({ outcome: 'created' }),
    ).not.toThrow();
    expect(() =>
      service.recordPaymentInitiation({ outcome: 'reused' }),
    ).not.toThrow();
    expect(() =>
      service.recordPaymentInitiation({ outcome: 'reconciled' }),
    ).not.toThrow();
    expect(() =>
      service.recordPaymentInitiation({ outcome: 'blocked' }),
    ).not.toThrow();
    expect(() =>
      service.recordPaymentInitiation({ outcome: 'failure' }),
    ).not.toThrow();
  });

  it('records refund settlement outcomes', () => {
    const service = new ObservabilityService();
    expect(() => service.recordRefundSettlement('initiated')).not.toThrow();
    expect(() => service.recordRefundSettlement('settled')).not.toThrow();
    expect(() => service.recordRefundSettlement('duplicate')).not.toThrow();
    expect(() => service.recordRefundSettlement('failed')).not.toThrow();
    expect(() => service.recordRefundSettlement('stale')).not.toThrow();
    expect(() => service.recordRefundSettlement('unmatched')).not.toThrow();
  });

  it('records auth throttle outcomes without identity labels', () => {
    const service = new ObservabilityService();
    expect(() =>
      service.recordAuthThrottle({
        surface: 'ADMIN',
        bucket: 'admin_login',
        outcome: 'limited',
      }),
    ).not.toThrow();
    expect(() =>
      service.recordAuthThrottle({
        surface: 'CUSTOMER',
        bucket: 'customer_auth',
        outcome: 'allowed',
      }),
    ).not.toThrow();
  });

  it('records media virus scan and fetch-denied outcomes', () => {
    const service = new ObservabilityService();
    expect(() =>
      service.recordMediaVirusScan({ outcome: 'clean' }),
    ).not.toThrow();
    expect(() =>
      service.recordMediaVirusScan({ outcome: 'infected' }),
    ).not.toThrow();
    expect(() =>
      service.recordMediaVirusScan({ outcome: 'failed' }),
    ).not.toThrow();
    expect(() =>
      service.recordMediaVirusScan({ outcome: 'unavailable' }),
    ).not.toThrow();
    expect(() =>
      service.recordMediaFetchDenied({ reason: 'blocked_host' }),
    ).not.toThrow();
  });

  it('records notification dispatch, delivery, replay and queue age metrics', () => {
    const service = new ObservabilityService();
    expect(() =>
      service.recordNotificationDispatch({
        category: 'TRANSACTIONAL',
        channel: 'EMAIL',
        outcome: 'queued',
      }),
    ).not.toThrow();
    expect(() =>
      service.recordNotificationDeliveryAttempt({
        category: 'TRANSACTIONAL',
        channel: 'EMAIL',
        outcome: 'success',
      }),
    ).not.toThrow();
    expect(() =>
      service.recordNotificationDeadLetterReplay({ outcome: 'success' }),
    ).not.toThrow();
    expect(() =>
      service.recordNotificationQueueOldestPendingAge(120),
    ).not.toThrow();
  });
});
