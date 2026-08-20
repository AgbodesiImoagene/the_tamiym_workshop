import { ConflictException } from '@nestjs/common';
import { InventoryLifecycleService } from './inventory-lifecycle.service';
import { InventoryMovementKind } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';

describe('InventoryLifecycleService', () => {
  const observability = {
    recordInventoryMovement: jest.fn(),
  };

  let service: InventoryLifecycleService;
  let tx: {
    inventoryMovement: {
      findUnique: jest.Mock;
      create: jest.Mock;
    };
    inventoryItem: { findUnique: jest.Mock };
    $executeRaw: jest.Mock;
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new InventoryLifecycleService(observability as never);
    tx = {
      inventoryMovement: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      inventoryItem: {
        findUnique: jest.fn().mockResolvedValue({
          trackInventory: true,
          stockOnHand: 10,
          reserved: 2,
        }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
  });

  it('reserves with conditional update and writes RESERVE movement', async () => {
    await service.reserveOrderItems(
      'ord-1',
      [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
      tx as never,
    );

    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: InventoryMovementKind.RESERVE,
          effectKey: 'inventory.reserve:orderItem:oi-1',
          reservedDelta: 2,
          stockOnHandDelta: 0,
        }),
      }),
    );
    expect(observability.recordInventoryMovement).toHaveBeenCalledWith(
      'reserve',
      'applied',
    );
  });

  it('is idempotent when reserve effectKey already exists', async () => {
    tx.inventoryMovement.findUnique.mockResolvedValue({ id: 'm1' });
    await service.reserveOrderItems(
      'ord-1',
      [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
      tx as never,
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(observability.recordInventoryMovement).toHaveBeenCalledWith(
      'reserve',
      'duplicate',
    );
  });

  it('rejects concurrent insufficient reserve', async () => {
    tx.$executeRaw.mockResolvedValue(0);
    await expect(
      service.reserveOrderItems(
        'ord-1',
        [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
        tx as never,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('skips untracked inventory on reserve', async () => {
    tx.inventoryItem.findUnique.mockResolvedValue({ trackInventory: false });
    await service.reserveOrderItems(
      'ord-1',
      [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
      tx as never,
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('releases reserved stock and skips when already consumed', async () => {
    tx.inventoryMovement.findUnique.mockImplementation(
      ({ where }: { where: { effectKey: string } }) => {
        if (where.effectKey.includes('consume')) {
          return Promise.resolve({ id: 'consume' });
        }
        return Promise.resolve(null);
      },
    );
    await service.releaseOrderItems(
      'ord-1',
      [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
      tx as never,
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(observability.recordInventoryMovement).toHaveBeenCalledWith(
      'release',
      'duplicate',
    );
  });

  it('consumes reserved stock into stockOnHand', async () => {
    await service.consumeOrderItems(
      'ord-1',
      [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
      tx as never,
      { reason: 'charge_success' },
    );
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: InventoryMovementKind.CONSUME,
          effectKey: 'inventory.consume:orderItem:oi-1',
          reservedDelta: -2,
          stockOnHandDelta: -2,
        }),
      }),
    );
  });

  it('refuses consume after release', async () => {
    tx.inventoryMovement.findUnique.mockImplementation(
      ({ where }: { where: { effectKey: string } }) => {
        if (where.effectKey.includes('release')) {
          return Promise.resolve({ id: 'release' });
        }
        return Promise.resolve(null);
      },
    );
    await expect(
      service.consumeOrderItems(
        'ord-1',
        [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
        tx as never,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('treats duplicate movement create as success', async () => {
    tx.inventoryMovement.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await service.reserveOrderItems(
      'ord-1',
      [{ id: 'oi-1', variantId: 'var-1', quantity: 1 }],
      tx as never,
    );
    expect(observability.recordInventoryMovement).toHaveBeenCalledWith(
      'reserve',
      'duplicate',
    );
  });
});
