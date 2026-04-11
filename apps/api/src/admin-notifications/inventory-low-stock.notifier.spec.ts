import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { InventoryLowStockNotifier } from './inventory-low-stock.notifier';
import { PrismaService } from '../prisma/prisma.service';
import { AdminNotifyService } from './admin-notify.service';
import {
  ADMIN_NOTIF_INVENTORY_CRITICAL,
  ADMIN_NOTIF_INVENTORY_LOW,
  ADMIN_NOTIF_INVENTORY_OUT_OF_STOCK,
} from './admin-notification-events';

const baseRow = {
  stockOnHand: 10,
  reserved: 0,
  lowStockThreshold: 5,
  trackInventory: true,
  variant: {
    id: 'var-1',
    name: 'S / Red',
    sku: 'SKU-1',
    product: { id: 'p1', name: 'Tee' },
  },
};

describe('InventoryLowStockNotifier', () => {
  let notifier: InventoryLowStockNotifier;
  let prisma: { inventoryItem: { findUnique: jest.Mock } };
  let emit: jest.Mock;
  let configGet: jest.Mock;

  beforeEach(async () => {
    emit = jest.fn().mockResolvedValue(undefined);
    configGet = jest.fn().mockReturnValue(undefined);
    prisma = {
      inventoryItem: { findUnique: jest.fn() },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryLowStockNotifier,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: configGet } },
        { provide: AdminNotifyService, useValue: { emit } },
      ],
    }).compile();

    notifier = module.get(InventoryLowStockNotifier);
  });

  it('does nothing when not tracking', async () => {
    prisma.inventoryItem.findUnique.mockResolvedValue({
      ...baseRow,
      trackInventory: false,
    });
    await notifier.afterInventoryChange('var-1', 100);
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits low only on downward crossing of variant threshold', async () => {
    prisma.inventoryItem.findUnique.mockResolvedValue({
      ...baseRow,
      stockOnHand: 4,
      reserved: 0,
      lowStockThreshold: 5,
    });
    await notifier.afterInventoryChange('var-1', 6);
    expect(emit).toHaveBeenCalledWith(
      ADMIN_NOTIF_INVENTORY_LOW,
      expect.objectContaining({
        available: 4,
        threshold: 5,
        previousAvailable: 6,
      }),
    );
    emit.mockClear();
    await notifier.afterInventoryChange('var-1', 4);
    expect(emit).not.toHaveBeenCalled();
  });

  it('does not emit low when variant lowStockThreshold is 0', async () => {
    prisma.inventoryItem.findUnique.mockResolvedValue({
      ...baseRow,
      stockOnHand: 2,
      reserved: 0,
      lowStockThreshold: 0,
    });
    await notifier.afterInventoryChange('var-1', 10);
    expect(emit).not.toHaveBeenCalled();
  });

  it('emits OOS when crossing to zero or below', async () => {
    prisma.inventoryItem.findUnique.mockResolvedValue({
      ...baseRow,
      stockOnHand: 0,
      reserved: 0,
      lowStockThreshold: 5,
    });
    await notifier.afterInventoryChange('var-1', 2);
    expect(emit).toHaveBeenCalledWith(
      ADMIN_NOTIF_INVENTORY_OUT_OF_STOCK,
      expect.objectContaining({ available: 0, previousAvailable: 2 }),
    );
  });

  it('OOS wins over critical and low on same step', async () => {
    configGet.mockImplementation((key: string) =>
      key === 'LOW_INVENTORY_CRITICAL_THRESHOLD' ? 3 : undefined,
    );
    prisma.inventoryItem.findUnique.mockResolvedValue({
      ...baseRow,
      stockOnHand: 0,
      reserved: 0,
      lowStockThreshold: 10,
    });
    await notifier.afterInventoryChange('var-1', 20);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      ADMIN_NOTIF_INVENTORY_OUT_OF_STOCK,
      expect.any(Object),
    );
  });

  it('emits critical when configured and crossing that band (not OOS)', async () => {
    configGet.mockImplementation((key: string) =>
      key === 'LOW_INVENTORY_CRITICAL_THRESHOLD' ? 3 : undefined,
    );
    prisma.inventoryItem.findUnique.mockResolvedValue({
      ...baseRow,
      stockOnHand: 2,
      reserved: 0,
      lowStockThreshold: 0,
    });
    await notifier.afterInventoryChange('var-1', 8);
    expect(emit).toHaveBeenCalledWith(
      ADMIN_NOTIF_INVENTORY_CRITICAL,
      expect.objectContaining({
        available: 2,
        criticalThreshold: 3,
        previousAvailable: 8,
      }),
    );
  });

  it('critical wins over low when both would cross in one step', async () => {
    configGet.mockImplementation((key: string) =>
      key === 'LOW_INVENTORY_CRITICAL_THRESHOLD' ? 3 : undefined,
    );
    prisma.inventoryItem.findUnique.mockResolvedValue({
      ...baseRow,
      stockOnHand: 2,
      reserved: 0,
      lowStockThreshold: 10,
    });
    await notifier.afterInventoryChange('var-1', 15);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenCalledWith(
      ADMIN_NOTIF_INVENTORY_CRITICAL,
      expect.any(Object),
    );
  });
});
