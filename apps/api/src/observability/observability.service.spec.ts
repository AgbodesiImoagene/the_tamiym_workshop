import { ObservabilityService } from './observability.service';

describe('ObservabilityService', () => {
  it('records charge settlement outcomes', () => {
    const service = new ObservabilityService();
    expect(() => service.recordChargeSettlement('settled')).not.toThrow();
    expect(() => service.recordChargeSettlement('duplicate')).not.toThrow();
    expect(() => service.recordChargeSettlement('rejected')).not.toThrow();
  });
});
