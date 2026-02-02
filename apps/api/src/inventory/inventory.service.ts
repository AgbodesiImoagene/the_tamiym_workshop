import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateInventoryDto } from './dto/update-inventory.dto';

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  /**
   * Get inventory for a variant (public or admin). Creates InventoryItem if not exists (lazy create).
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

    return this.getByVariantId(variantId);
  }
}
