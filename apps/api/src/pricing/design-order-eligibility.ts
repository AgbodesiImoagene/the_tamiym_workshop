import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { ModerationStatus } from '../generated/prisma/enums';
import type { PrismaService } from '../prisma/prisma.service';

type DesignReader = Pick<PrismaService, 'design' | 'productVariant'>;

/**
 * TTW-239: the one rule for "this user may quote or order this design on this variant".
 * Used by the standard quote and by order creation, so they refuse the same designs with
 * the same status and code. Per line that carries a design, in this order:
 *
 * 1. the design exists (400);
 * 2. it belongs to the caller (403), checked before anything else about it is revealed;
 * 3. the variant exists (400);
 * 4. the design is for the variant's product (400);
 * 5. a moderator did not reject it (400, code `DESIGN_REJECTED`).
 *
 * PENDING, FLAGGED and APPROVED designs pass: neither a quote nor an order waits for
 * moderation (client answer Q28). Campaign quotes have their own rule and do not use this.
 */
export async function assertDesignsOrderableBy(
  prisma: DesignReader,
  userId: string,
  items: Array<{ variantId: string; designId?: string | null }>,
): Promise<void> {
  // A cart often holds the same design in several sizes: read each design and each
  // variant once per call, not once per line.
  const designs = new Map<string, ReturnType<typeof readDesign>>();
  const variants = new Map<string, ReturnType<typeof readVariant>>();
  const readDesign = (id: string) =>
    prisma.design.findUnique({
      where: { id },
      select: {
        id: true,
        userId: true,
        productId: true,
        moderationStatus: true,
      },
    });
  const readVariant = (id: string) =>
    prisma.productVariant.findUnique({
      where: { id },
      select: { productId: true },
    });
  const once = <T>(
    cache: Map<string, T>,
    id: string,
    read: (id: string) => T,
  ) => {
    let value = cache.get(id);
    if (value === undefined) {
      value = read(id);
      cache.set(id, value);
    }
    return value;
  };

  for (const item of items) {
    if (!item.designId) continue;
    const [design, variant] = await Promise.all([
      once(designs, item.designId, readDesign),
      once(variants, item.variantId, readVariant),
    ]);
    if (!design) {
      throw new BadRequestException(`Design ${item.designId} not found`);
    }
    if (design.userId !== userId) {
      throw new ForbiddenException(
        'Access denied: design does not belong to you',
      );
    }
    if (!variant) {
      throw new BadRequestException(`Variant ${item.variantId} not found`);
    }
    if (design.productId !== variant.productId) {
      throw new BadRequestException(
        `Design does not belong to the same product as variant ${item.variantId}`,
      );
    }
    if (design.moderationStatus === ModerationStatus.REJECTED) {
      throw new BadRequestException({
        code: 'DESIGN_REJECTED',
        message: 'This design was rejected by moderation and cannot be ordered',
      });
    }
  }
}
