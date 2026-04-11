import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AdminNotifyService } from './admin-notify.service';
import {
  ADMIN_NOTIF_INVENTORY_CRITICAL,
  ADMIN_NOTIF_INVENTORY_LOW,
  ADMIN_NOTIF_INVENTORY_OUT_OF_STOCK,
} from './admin-notification-events';

type InventoryRow = {
  stockOnHand: number;
  reserved: number;
  lowStockThreshold: number;
  trackInventory: boolean;
  variant: {
    id: string;
    name: string;
    sku: string | null;
    product: { id: string; name: string } | null;
  };
};

/**
 * Emits at most one admin inventory alert per change, only on **downward threshold
 * crossings** (noise reduction):
 *
 * 1. **Out of stock** — was above 0, now ≤ 0.
 * 2. Else **critical** — if `LOW_INVENTORY_CRITICAL_THRESHOLD` is a positive integer,
 *    was above C, now ≤ C.
 * 3. Else **low** — only if `InventoryItem.lowStockThreshold > 0`, was above T, now ≤ T.
 *
 * When `lowStockThreshold` is 0 on the row, there is **no** “low” tier (use critical
 * and/or OOS). For a brand-new inventory row, pass `previousAvailable` as
 * `Number.MAX_SAFE_INTEGER` so the first persisted state can still trigger crossings.
 */
@Injectable()
export class InventoryLowStockNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly adminNotify: AdminNotifyService,
  ) {}

  /**
   * @param previousAvailable sellable count before this change (stockOnHand − reserved).
   */
  async afterInventoryChange(
    variantId: string,
    previousAvailable: number,
  ): Promise<void> {
    const row = await this.prisma.inventoryItem.findUnique({
      where: { variantId },
      include: {
        variant: {
          select: {
            id: true,
            name: true,
            sku: true,
            product: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!row?.trackInventory || !row.variant) {
      return;
    }

    const inv = row as InventoryRow;
    const afterAvailable = inv.stockOnHand - inv.reserved;
    const payload = {
      variantId,
      variantName: inv.variant.name,
      sku: inv.variant.sku ?? '',
      productId: inv.variant.product?.id ?? '',
      productName: inv.variant.product?.name ?? '',
      available: afterAvailable,
      stockOnHand: inv.stockOnHand,
      reserved: inv.reserved,
      previousAvailable,
    };

    if (previousAvailable > 0 && afterAvailable <= 0) {
      await this.adminNotify.emit(ADMIN_NOTIF_INVENTORY_OUT_OF_STOCK, payload);
      return;
    }

    const critical = this.getCriticalThreshold();
    if (critical !== null) {
      if (previousAvailable > critical && afterAvailable <= critical) {
        await this.adminNotify.emit(ADMIN_NOTIF_INVENTORY_CRITICAL, {
          ...payload,
          criticalThreshold: critical,
        });
        return;
      }
    }

    const lowT = inv.lowStockThreshold > 0 ? inv.lowStockThreshold : null;
    if (lowT !== null) {
      if (previousAvailable > lowT && afterAvailable <= lowT) {
        await this.adminNotify.emit(ADMIN_NOTIF_INVENTORY_LOW, {
          ...payload,
          threshold: lowT,
        });
      }
    }
  }

  private getCriticalThreshold(): number | null {
    const raw = this.config.get<string | number | undefined>(
      'LOW_INVENTORY_CRITICAL_THRESHOLD',
    );
    if (raw === undefined || raw === null || raw === '') {
      return null;
    }
    const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
    if (!Number.isFinite(n) || n <= 0) {
      return null;
    }
    return Math.floor(n);
  }
}
