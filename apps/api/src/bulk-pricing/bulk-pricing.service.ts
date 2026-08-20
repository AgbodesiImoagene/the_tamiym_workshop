import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Two quantity ranges [minA, maxA] and [minB, maxB] overlap if there exists an integer n
 * in both. Treat null max as infinity.
 */
function rangesOverlap(
  minA: number,
  maxA: number | null,
  minB: number,
  maxB: number | null,
): boolean {
  const highA = maxA ?? Number.POSITIVE_INFINITY;
  const highB = maxB ?? Number.POSITIVE_INFINITY;
  return !(highA < minB || highB < minA);
}

function mapBulkConstraintError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err);
  if (
    /bulk_pricing_quantity_no_overlap/i.test(message) ||
    /conflicting key value violates exclusion constraint/i.test(message)
  ) {
    throw new BadRequestException(
      'Quantity range overlaps an existing tier for this product/variant/currency. Tiers must not overlap.',
    );
  }
  throw err;
}

@Injectable()
export class BulkPricingService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Asserts that adding or updating a tier with the given scope and quantity range
   * does not overlap existing tiers. Throws BadRequestException if overlap or invalid range.
   */
  async assertNoOverlap(
    productId: string,
    variantId: string | null,
    currency: string,
    minQuantity: number,
    maxQuantity: number | null,
    excludeId?: string,
  ): Promise<void> {
    if (minQuantity < 1) {
      throw new BadRequestException('minQuantity must be at least 1.');
    }
    if (maxQuantity != null && maxQuantity < minQuantity) {
      throw new BadRequestException(
        'maxQuantity must be >= minQuantity when set.',
      );
    }

    const existing = await this.prisma.bulkPricing.findMany({
      where: {
        productId,
        variantId: variantId ?? null,
        currency: currency as 'NGN',
        id: excludeId ? { not: excludeId } : undefined,
      },
    });

    for (const tier of existing) {
      const overlaps = rangesOverlap(
        minQuantity,
        maxQuantity,
        tier.minQuantity,
        tier.maxQuantity,
      );
      if (overlaps) {
        const rangeDesc =
          tier.maxQuantity != null
            ? `${tier.minQuantity}–${tier.maxQuantity}`
            : `${tier.minQuantity}+`;
        throw new BadRequestException(
          `Quantity range overlaps existing tier ${rangeDesc} for this product/variant/currency. Tiers must not overlap.`,
        );
      }
    }
  }

  async create(data: {
    productId: string;
    variantId?: string | null;
    currency: string;
    minQuantity: number;
    maxQuantity?: number | null;
    pricePerUnit: number;
  }) {
    await this.assertNoOverlap(
      data.productId,
      data.variantId ?? null,
      data.currency,
      data.minQuantity,
      data.maxQuantity ?? null,
    );
    try {
      return await this.prisma.bulkPricing.create({
        data: {
          productId: data.productId,
          variantId: data.variantId ?? null,
          currency: data.currency as 'NGN',
          minQuantity: data.minQuantity,
          maxQuantity: data.maxQuantity ?? null,
          pricePerUnit: data.pricePerUnit,
        },
      });
    } catch (err: unknown) {
      mapBulkConstraintError(err);
    }
  }

  async update(
    id: string,
    data: {
      minQuantity?: number;
      maxQuantity?: number | null;
      pricePerUnit?: number;
    },
  ) {
    const existing = await this.prisma.bulkPricing.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Bulk pricing tier not found');
    }
    const minQuantity = data.minQuantity ?? existing.minQuantity;
    const maxQuantity =
      data.maxQuantity !== undefined ? data.maxQuantity : existing.maxQuantity;
    await this.assertNoOverlap(
      existing.productId,
      existing.variantId,
      existing.currency,
      minQuantity,
      maxQuantity,
      id,
    );
    try {
      return await this.prisma.bulkPricing.update({
        where: { id },
        data: {
          minQuantity: data.minQuantity,
          maxQuantity: data.maxQuantity,
          pricePerUnit: data.pricePerUnit,
        },
      });
    } catch (err: unknown) {
      mapBulkConstraintError(err);
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.bulkPricing.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Bulk pricing tier not found');
    }
    return this.prisma.bulkPricing.delete({ where: { id } });
  }
}
