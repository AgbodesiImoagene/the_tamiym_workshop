import { Test, TestingModule } from '@nestjs/testing';
import { AdminShipmentsController } from './admin-shipments.controller';
import { ShipmentsService } from '../shipments/shipments.service';

describe('AdminShipmentsController', () => {
  let controller: AdminShipmentsController;
  const shipments = {
    createForOrder: jest.fn(),
    listForOrderAdmin: jest.fn(),
    getForAdmin: jest.fn(),
    updateStatus: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminShipmentsController],
      providers: [{ provide: ShipmentsService, useValue: shipments }],
    }).compile();
    controller = module.get(AdminShipmentsController);
  });

  it('delegates create to service with actor id', async () => {
    shipments.createForOrder.mockResolvedValue({ id: 'ship-1' });
    const result = await controller.create(
      { id: 'admin-1' } as never,
      'order-1',
      { carrierCode: 'MANUAL' },
    );
    expect(shipments.createForOrder).toHaveBeenCalledWith(
      'order-1',
      { carrierCode: 'MANUAL' },
      'admin-1',
    );
    expect(result).toEqual({ id: 'ship-1' });
  });

  it('delegates list/get/update', async () => {
    shipments.listForOrderAdmin.mockResolvedValue([]);
    shipments.getForAdmin.mockResolvedValue({ id: 'ship-1' });
    shipments.updateStatus.mockResolvedValue({ id: 'ship-1' });

    await controller.listForOrder('order-1');
    await controller.get('ship-1');
    await controller.update({ id: 'admin-1' } as never, 'ship-1', {
      status: 'DISPATCHED',
      idempotencyKey: 'idem-1',
      trackingNumber: 'TRK1',
    });

    expect(shipments.listForOrderAdmin).toHaveBeenCalledWith('order-1');
    expect(shipments.getForAdmin).toHaveBeenCalledWith('ship-1');
    expect(shipments.updateStatus).toHaveBeenCalledWith(
      'ship-1',
      expect.objectContaining({ status: 'DISPATCHED' }),
      'admin-1',
    );
  });
});
