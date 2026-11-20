import { ShippingAdminService } from '../shipping/shipping-admin.service';
import { AdminShippingController } from './admin-shipping.controller';

/**
 * TTW-097: every correction route hands the service the admin's
 * acknowledgement of a coverage loss, and only an explicit `true` counts.
 */
describe('AdminShippingController corrections (TTW-097)', () => {
  let controller: AdminShippingController;
  let service: Record<string, jest.Mock>;

  beforeEach(() => {
    service = {
      updateZone: jest.fn().mockResolvedValue({}),
      deleteZone: jest.fn().mockResolvedValue(undefined),
      deleteArea: jest.fn().mockResolvedValue(undefined),
      updateRule: jest.fn().mockResolvedValue({}),
      deleteRule: jest.fn().mockResolvedValue(undefined),
      updateRate: jest.fn().mockResolvedValue({}),
      deleteRate: jest.fn().mockResolvedValue(undefined),
    };
    controller = new AdminShippingController(
      service as unknown as ShippingAdminService,
    );
  });

  const ACK = { acknowledgeCoverageLoss: true };
  const NO_ACK = { acknowledgeCoverageLoss: false };

  it('passes the acknowledgement on every correction route', async () => {
    await controller.updateZone('z', {}, 'true');
    await controller.deleteZone('z', 'true');
    await controller.deleteArea('z', 'a', 'true');
    await controller.updateRule('r', {}, 'true');
    await controller.deleteRule('r', 'true');
    await controller.updateRate('t', {}, 'true');
    await controller.deleteRate('t', 'true');

    expect(service.updateZone).toHaveBeenCalledWith('z', {}, ACK);
    expect(service.deleteZone).toHaveBeenCalledWith('z', ACK);
    expect(service.deleteArea).toHaveBeenCalledWith('z', 'a', ACK);
    expect(service.updateRule).toHaveBeenCalledWith('r', {}, ACK);
    expect(service.deleteRule).toHaveBeenCalledWith('r', ACK);
    expect(service.updateRate).toHaveBeenCalledWith('t', {}, ACK);
    expect(service.deleteRate).toHaveBeenCalledWith('t', ACK);
  });

  it('does not acknowledge when the flag is missing or not exactly "true"', async () => {
    await controller.deleteRate('t');
    await controller.deleteRate('t', 'yes');
    await controller.deleteArea('z', 'a', '1');

    expect(service.deleteRate).toHaveBeenNthCalledWith(1, 't', NO_ACK);
    expect(service.deleteRate).toHaveBeenNthCalledWith(2, 't', NO_ACK);
    expect(service.deleteArea).toHaveBeenCalledWith('z', 'a', NO_ACK);
  });
});
