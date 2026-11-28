import { BadRequestException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { ProductStatus } from '../generated/prisma/enums';

/**
 * TTW-275: the one rule for "this product may be quoted or ordered", standard and
 * campaign: only an ACTIVE product.
 */
export function isProductOrderable(status: ProductStatus): boolean {
  return status === ProductStatus.ACTIVE;
}

/**
 * The refusal of a line. The message is the one of an unavailable variant, so the
 * answer reveals neither the product's name nor whether it is a draft or archived.
 */
export function productNotAvailable(variantId: string): BadRequestException {
  return new BadRequestException({
    code: 'PRODUCT_NOT_AVAILABLE',
    message: `Variant ${variantId} is not available`,
  });
}

/**
 * Check the ordered products again inside the order's transaction, holding a shared
 * lock on their rows until it ends: a status change either committed before this
 * read, and the order is refused, or waits for the order to commit. A product can
 * therefore not leave ACTIVE between the quote and the order.
 *
 * Call it before reserving inventory. Products are locked in id order; orders do not
 * block each other.
 */
export async function lockOrderableProducts(
  tx: Prisma.TransactionClient,
  variantIds: string[],
): Promise<void> {
  const rows = await tx.$queryRaw<
    Array<{ variantId: string; status: ProductStatus }>
  >`
    SELECT v."id" AS "variantId", p."status"::text AS "status"
    FROM "product_variants" v
    JOIN "products" p ON p."id" = v."productId"
    WHERE v."id" IN (${Prisma.join(variantIds)})
    ORDER BY p."id"
    FOR SHARE OF p`;
  const statuses = new Map(rows.map((row) => [row.variantId, row.status]));
  // In the order of the lines; a variant that is gone is refused too.
  for (const variantId of variantIds) {
    const status = statuses.get(variantId);
    if (!status || !isProductOrderable(status)) {
      throw productNotAvailable(variantId);
    }
  }
}
