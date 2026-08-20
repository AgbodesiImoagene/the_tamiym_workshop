import { ConflictException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { InventoryMovementKind } from '../generated/prisma/enums';
import { ObservabilityService } from '../observability/observability.service';

export type InventoryLine = {
  id: string;
  variantId: string;
  quantity: number;
};

type TxClient = Prisma.TransactionClient;

function effectKey(
  kind: 'reserve' | 'release' | 'consume',
  orderItemId: string,
): string {
  return `inventory.${kind}:orderItem:${orderItemId}`;
}

/**
 * TTW-014: exactly-once inventory transitions keyed per order line.
 * Insert the movement row first; only then mutate counters. A duplicate
 * effectKey is a no-op before any counter change. Counter failures abort
 * the transaction (including the movement insert).
 *
 * Paths: reserve→release (unpaid cancel/expiry) or reserve→consume (payment settle).
 * Refunds do not restock here (physical disposition → TTW-041).
 */
@Injectable()
export class InventoryLifecycleService {
  constructor(private readonly observability: ObservabilityService) {}

  /**
   * Reserve stock for newly created order lines. Idempotent on effectKey.
   * Requires order items to already exist (stable ids for effect keys).
   */
  async reserveOrderItems(
    orderId: string,
    items: InventoryLine[],
    tx: TxClient,
  ): Promise<void> {
    for (const item of items) {
      if (item.quantity <= 0) continue;
      const key = effectKey('reserve', item.id);

      const inv = await tx.inventoryItem.findUnique({
        where: { variantId: item.variantId },
      });
      if (!inv?.trackInventory) continue;

      const inserted = await this.tryInsertMovement(tx, {
        kind: InventoryMovementKind.RESERVE,
        effectKey: key,
        variantId: item.variantId,
        orderId,
        orderItemId: item.id,
        quantity: item.quantity,
        reservedDelta: item.quantity,
        stockOnHandDelta: 0,
      });
      if (!inserted) {
        this.observability.recordInventoryMovement('reserve', 'duplicate');
        continue;
      }

      const affected = await tx.$executeRaw(
        Prisma.sql`UPDATE inventory_items SET reserved = reserved + ${item.quantity}
          WHERE "variantId" = ${item.variantId}
            AND "trackInventory" = true
            AND ("stockOnHand" - reserved) >= ${item.quantity}`,
      );
      if (affected === 0) {
        this.observability.recordInventoryMovement('reserve', 'rejected');
        throw new ConflictException(
          `Insufficient stock for variant ${item.variantId} (concurrent reservation)`,
        );
      }
      this.observability.recordInventoryMovement('reserve', 'applied');
    }
  }

  /**
   * Release reserved stock for unpaid cancel/expiry. No-op if already released or consumed.
   */
  async releaseOrderItems(
    orderId: string,
    items: InventoryLine[],
    tx: TxClient,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    for (const item of items) {
      if (item.quantity <= 0) continue;
      const releaseKey = effectKey('release', item.id);
      const consumeKey = effectKey('consume', item.id);

      const existingConsume = await tx.inventoryMovement.findUnique({
        where: { effectKey: consumeKey },
      });
      if (existingConsume) {
        this.observability.recordInventoryMovement('release', 'duplicate');
        continue;
      }

      const inv = await tx.inventoryItem.findUnique({
        where: { variantId: item.variantId },
      });
      if (!inv?.trackInventory) continue;

      const inserted = await this.tryInsertMovement(tx, {
        kind: InventoryMovementKind.RELEASE,
        effectKey: releaseKey,
        variantId: item.variantId,
        orderId,
        orderItemId: item.id,
        quantity: item.quantity,
        reservedDelta: -item.quantity,
        stockOnHandDelta: 0,
        metadata,
      });
      if (!inserted) {
        this.observability.recordInventoryMovement('release', 'duplicate');
        continue;
      }

      const affected = await tx.$executeRaw(
        Prisma.sql`UPDATE inventory_items SET reserved = reserved - ${item.quantity}
          WHERE "variantId" = ${item.variantId}
            AND "trackInventory" = true
            AND reserved >= ${item.quantity}`,
      );
      if (affected === 0) {
        this.observability.recordInventoryMovement('release', 'rejected');
        throw new ConflictException(
          `Cannot release orderItem ${item.id}: reserved counter insufficient ` +
            `(order ${orderId}, variant ${item.variantId})`,
        );
      }
      this.observability.recordInventoryMovement('release', 'applied');
    }
  }

  /**
   * Convert reservation to consumed stock on payment settlement. Idempotent; refuses lines already released.
   */
  async consumeOrderItems(
    orderId: string,
    items: InventoryLine[],
    tx: TxClient,
    metadata?: Record<string, unknown>,
  ): Promise<void> {
    for (const item of items) {
      if (item.quantity <= 0) continue;
      const consumeKey = effectKey('consume', item.id);
      const releaseKey = effectKey('release', item.id);

      const existingRelease = await tx.inventoryMovement.findUnique({
        where: { effectKey: releaseKey },
      });
      if (existingRelease) {
        this.observability.recordInventoryMovement('consume', 'rejected');
        throw new ConflictException(
          `Cannot consume orderItem ${item.id}: reservation already released`,
        );
      }

      const inv = await tx.inventoryItem.findUnique({
        where: { variantId: item.variantId },
      });
      if (!inv?.trackInventory) continue;

      const inserted = await this.tryInsertMovement(tx, {
        kind: InventoryMovementKind.CONSUME,
        effectKey: consumeKey,
        variantId: item.variantId,
        orderId,
        orderItemId: item.id,
        quantity: item.quantity,
        reservedDelta: -item.quantity,
        stockOnHandDelta: -item.quantity,
        metadata,
      });
      if (!inserted) {
        this.observability.recordInventoryMovement('consume', 'duplicate');
        continue;
      }

      const affected = await tx.$executeRaw(
        Prisma.sql`UPDATE inventory_items
          SET reserved = reserved - ${item.quantity},
              "stockOnHand" = "stockOnHand" - ${item.quantity}
          WHERE "variantId" = ${item.variantId}
            AND "trackInventory" = true
            AND reserved >= ${item.quantity}
            AND "stockOnHand" >= ${item.quantity}`,
      );
      if (affected === 0) {
        this.observability.recordInventoryMovement('consume', 'rejected');
        throw new ConflictException(
          `Cannot consume inventory for variant ${item.variantId} (order ${orderId})`,
        );
      }
      this.observability.recordInventoryMovement('consume', 'applied');
    }
  }

  private async tryInsertMovement(
    tx: TxClient,
    data: {
      kind: InventoryMovementKind;
      effectKey: string;
      variantId: string;
      orderId: string;
      orderItemId: string;
      quantity: number;
      reservedDelta: number;
      stockOnHandDelta: number;
      metadata?: Record<string, unknown>;
    },
  ): Promise<boolean> {
    try {
      await tx.inventoryMovement.create({
        data: {
          kind: data.kind,
          effectKey: data.effectKey,
          variantId: data.variantId,
          orderId: data.orderId,
          orderItemId: data.orderItemId,
          quantity: data.quantity,
          reservedDelta: data.reservedDelta,
          stockOnHandDelta: data.stockOnHandDelta,
          metadata: (data.metadata ?? undefined) as
            | Prisma.InputJsonValue
            | undefined,
        },
      });
      return true;
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return false;
      }
      throw error;
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
