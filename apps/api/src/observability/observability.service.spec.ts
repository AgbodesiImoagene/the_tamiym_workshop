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
});
