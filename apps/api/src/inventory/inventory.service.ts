import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateInventoryDto } from './dto/update-inventory.dto';
import { InventoryLowStockNotifier } from '../admin-notifications/inventory-low-stock.notifier';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private readonly inventoryLowStockNotifier: InventoryLowStockNotifier,
  ) {}

  /**
   * Get inventory for a variant (public or admin).
   * If no InventoryItem row exists yet, returns a virtual zero-stock object
   * rather than creating a DB row (the caller treats it as 0 stock).
   * An InventoryItem row is only written on the first admin update via
   * updateVariantInventory().
   */
  async getByVariantId(variantId: string) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: { select: { id: true, name: true, slug: true } },
        inventory: true,
      },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }
    // If no inventory row exists, return variant with null inventory (caller can treat as 0 stock)
    return {
      variantId: variant.id,
      variantName: variant.name,
      sku: variant.sku,
      isAvailable: variant.isAvailable,
      product: variant.product,
      inventory: variant.inventory ?? {
        id: null,
        variantId: variant.id,
        stockOnHand: 0,
        reserved: 0,
        trackInventory: true,
        lowStockThreshold: 0,
        updatedAt: variant.updatedAt,
        createdAt: variant.createdAt,
      },
    };
  }

  /**
   * Update inventory for a variant (admin). Creates InventoryItem if not exists.
   */
  async updateVariantInventory(variantId: string, dto: UpdateInventoryDto) {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: variantId },
      include: { inventory: true },
    });
    if (!variant) {
      throw new NotFoundException('Variant not found');
    }

    const effectiveStock =
      dto.stockOnHand ?? variant.inventory?.stockOnHand ?? 0;
    const effectiveReserved = dto.reserved ?? variant.inventory?.reserved ?? 0;
    if (effectiveReserved > effectiveStock) {
      throw new BadRequestException('reserved must not exceed stockOnHand');
    }

    const previousAvailable =
      variant.inventory != null
        ? (variant.inventory.stockOnHand ?? 0) -
          (variant.inventory.reserved ?? 0)
        : Number.MAX_SAFE_INTEGER;

    const updateData: {
      stockOnHand?: number;
      reserved?: number;
      lowStockThreshold?: number;
      trackInventory?: boolean;
    } = {};
    if (dto.stockOnHand !== undefined) updateData.stockOnHand = dto.stockOnHand;
    if (dto.reserved !== undefined) updateData.reserved = dto.reserved;
    if (dto.lowStockThreshold !== undefined)
      updateData.lowStockThreshold = dto.lowStockThreshold;
    if (dto.trackInventory !== undefined)
      updateData.trackInventory = dto.trackInventory;

    if (variant.inventory) {
      await this.prisma.inventoryItem.update({
        where: { id: variant.inventory.id },
        data: updateData,
      });
    } else {
      await this.prisma.inventoryItem.create({
        data: {
          variantId,
          stockOnHand: dto.stockOnHand ?? 0,
          reserved: dto.reserved ?? 0,
          lowStockThreshold: dto.lowStockThreshold ?? 0,
          trackInventory: dto.trackInventory ?? true,
        },
      });
    }

    if (dto.isAvailable !== undefined) {
      await this.prisma.productVariant.update({
        where: { id: variantId },
        data: { isAvailable: dto.isAvailable },
      });
    }

    await this.inventoryLowStockNotifier.afterInventoryChange(
      variantId,
      previousAvailable,
    );

    return this.getByVariantId(variantId);
  }
}
