import { ObservabilityService } from './observability.service';

describe('ObservabilityService', () => {
  it('records charge settlement outcomes', () => {
    const service = new ObservabilityService();
    expect(() => service.recordChargeSettlement('settled')).not.toThrow();
    expect(() => service.recordChargeSettlement('duplicate')).not.toThrow();
    expect(() => service.recordChargeSettlement('rejected')).not.toThrow();
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
});
