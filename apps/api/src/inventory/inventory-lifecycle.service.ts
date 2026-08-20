import { ConflictException, Injectable, Logger } from '@nestjs/common';
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
 * Paths: reserve→release (unpaid cancel/expiry) or reserve→consume (payment settle).
 * Refunds do not restock here (physical disposition → TTW-041).
 */
@Injectable()
export class InventoryLifecycleService {
  private readonly logger = new Logger(InventoryLifecycleService.name);

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
      const existing = await tx.inventoryMovement.findUnique({
        where: { effectKey: key },
      });
      if (existing) {
        this.observability.recordInventoryMovement('reserve', 'duplicate');
        continue;
      }

      const inv = await tx.inventoryItem.findUnique({
        where: { variantId: item.variantId },
      });
      if (!inv?.trackInventory) continue;

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

      try {
        await tx.inventoryMovement.create({
          data: {
            kind: InventoryMovementKind.RESERVE,
            effectKey: key,
            variantId: item.variantId,
            orderId,
            orderItemId: item.id,
            quantity: item.quantity,
            reservedDelta: item.quantity,
            stockOnHandDelta: 0,
          },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          this.observability.recordInventoryMovement('reserve', 'duplicate');
          continue;
        }
        throw error;
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

      const [existingRelease, existingConsume] = await Promise.all([
        tx.inventoryMovement.findUnique({ where: { effectKey: releaseKey } }),
        tx.inventoryMovement.findUnique({ where: { effectKey: consumeKey } }),
      ]);
      if (existingRelease || existingConsume) {
        this.observability.recordInventoryMovement('release', 'duplicate');
        continue;
      }

      const inv = await tx.inventoryItem.findUnique({
        where: { variantId: item.variantId },
      });
      if (!inv?.trackInventory) continue;

      // Prefer releasing only when a reserve movement exists (new path).
      // Legacy rows without movements still get a guarded decrement once.
      const reserve = await tx.inventoryMovement.findUnique({
        where: { effectKey: effectKey('reserve', item.id) },
      });

      const affected = await tx.$executeRaw(
        Prisma.sql`UPDATE inventory_items SET reserved = reserved - ${item.quantity}
          WHERE "variantId" = ${item.variantId}
            AND "trackInventory" = true
            AND reserved >= ${item.quantity}`,
      );
      if (affected === 0) {
        this.logger.warn(
          `Release skipped for orderItem ${item.id}: reserved counter insufficient ` +
            `(order ${orderId}, variant ${item.variantId}, qty ${item.quantity}, ` +
            `hadReserveMovement=${Boolean(reserve)})`,
        );
        this.observability.recordInventoryMovement('release', 'rejected');
        continue;
      }

      try {
        await tx.inventoryMovement.create({
          data: {
            kind: InventoryMovementKind.RELEASE,
            effectKey: releaseKey,
            variantId: item.variantId,
            orderId,
            orderItemId: item.id,
            quantity: item.quantity,
            reservedDelta: -item.quantity,
            stockOnHandDelta: 0,
            metadata: (metadata ?? undefined) as
              | Prisma.InputJsonValue
              | undefined,
          },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          this.observability.recordInventoryMovement('release', 'duplicate');
          continue;
        }
        throw error;
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

      const [existingConsume, existingRelease] = await Promise.all([
        tx.inventoryMovement.findUnique({ where: { effectKey: consumeKey } }),
        tx.inventoryMovement.findUnique({ where: { effectKey: releaseKey } }),
      ]);
      if (existingConsume) {
        this.observability.recordInventoryMovement('consume', 'duplicate');
        continue;
      }
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

      try {
        await tx.inventoryMovement.create({
          data: {
            kind: InventoryMovementKind.CONSUME,
            effectKey: consumeKey,
            variantId: item.variantId,
            orderId,
            orderItemId: item.id,
            quantity: item.quantity,
            reservedDelta: -item.quantity,
            stockOnHandDelta: -item.quantity,
            metadata: (metadata ?? undefined) as
              | Prisma.InputJsonValue
              | undefined,
          },
        });
      } catch (error) {
        if (isUniqueConstraintError(error)) {
          this.observability.recordInventoryMovement('consume', 'duplicate');
          continue;
        }
        throw error;
      }
      this.observability.recordInventoryMovement('consume', 'applied');
    }
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}
