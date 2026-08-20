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

  it('inserts RESERVE movement before conditional counter update', async () => {
    await service.reserveOrderItems(
      'ord-1',
      [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
      tx as never,
    );

    expect(tx.inventoryMovement.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          kind: InventoryMovementKind.RESERVE,
          effectKey: 'inventory.reserve:orderItem:oi-1',
          reservedDelta: 2,
        }),
      }),
    );
    expect(tx.$executeRaw).toHaveBeenCalled();
    expect(observability.recordInventoryMovement).toHaveBeenCalledWith(
      'reserve',
      'applied',
    );
  });

  it('is idempotent when reserve effectKey already exists (no counter mutation)', async () => {
    tx.inventoryMovement.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
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

  it('rejects concurrent insufficient reserve and rolls back via throw', async () => {
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
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
  });

  it('releases reserved stock and skips when already consumed', async () => {
    tx.inventoryMovement.findUnique.mockResolvedValue({ id: 'consume' });
    await service.releaseOrderItems(
      'ord-1',
      [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
      tx as never,
    );
    expect(tx.inventoryMovement.create).not.toHaveBeenCalled();
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(observability.recordInventoryMovement).toHaveBeenCalledWith(
      'release',
      'duplicate',
    );
  });

  it('throws when release counter update cannot apply', async () => {
    tx.$executeRaw.mockResolvedValue(0);
    await expect(
      service.releaseOrderItems(
        'ord-1',
        [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
        tx as never,
      ),
    ).rejects.toThrow(ConflictException);
  });

  it('consumes reserved stock into stockOnHand', async () => {
    await service.consumeOrderItems(
      'ord-1',
      [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
      tx as never,
      { reason: 'charge_success' },
    );
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
    expect(tx.$executeRaw).toHaveBeenCalled();
  });

  it('consumes as duplicate when effectKey already exists', async () => {
    tx.inventoryMovement.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    await service.consumeOrderItems(
      'ord-1',
      [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
      tx as never,
    );
    expect(tx.$executeRaw).not.toHaveBeenCalled();
    expect(observability.recordInventoryMovement).toHaveBeenCalledWith(
      'consume',
      'duplicate',
    );
  });

  it('throws when consume counter update cannot apply', async () => {
    tx.$executeRaw.mockResolvedValue(0);
    await expect(
      service.consumeOrderItems(
        'ord-1',
        [{ id: 'oi-1', variantId: 'var-1', quantity: 2 }],
        tx as never,
      ),
    ).rejects.toThrow(ConflictException);
    expect(observability.recordInventoryMovement).toHaveBeenCalledWith(
      'consume',
      'rejected',
    );
  });

  it('rethrows non-unique movement insert failures', async () => {
    tx.inventoryMovement.create.mockRejectedValue(new Error('db down'));
    await expect(
      service.reserveOrderItems(
        'ord-1',
        [{ id: 'oi-1', variantId: 'var-1', quantity: 1 }],
        tx as never,
      ),
    ).rejects.toThrow('db down');
  });

  it('releases as duplicate when insert loses the effectKey race', async () => {
    tx.inventoryMovement.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
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
});
