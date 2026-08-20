import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';
import {
  type DiscountScope,
  type DiscountStatus,
  type DiscountType,
  DiscountScope as ScopeEnum,
  DiscountType as TypeEnum,
} from '../generated/prisma/enums';

export interface DiscountSubject {
  kind: 'sitewide' | 'campaign' | 'product' | 'variant';
  id: string | null;
}

export interface ValidateDiscountInput {
  excludeDiscountId?: string;
  type: DiscountType;
  scope: DiscountScope;
  currency?: string | null;
  campaignIds: string[];
  productIds: string[];
  variantIds: string[];
  status: DiscountStatus;
}

/**
 * Enforces: one active discount per subject; for FIXED, one per (subject, currency);
 * FIXED requires currency; PERCENTAGE and FIXED cannot both be active for the same subject.
 */
@Injectable()
export class DiscountsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Resolve subject identifiers from scope and link IDs. Used for validation.
   */
  getSubjects(input: {
    scope: DiscountScope;
    campaignIds: string[];
    productIds: string[];
    variantIds: string[];
  }): DiscountSubject[] {
    const { scope, campaignIds, productIds, variantIds } = input;
    if (
      scope === ScopeEnum.ORDER &&
      campaignIds.length === 0 &&
      productIds.length === 0 &&
      variantIds.length === 0
    ) {
      return [{ kind: 'sitewide', id: null }];
    }
    if (scope === ScopeEnum.CAMPAIGN) {
      return campaignIds.map((id) => ({ kind: 'campaign' as const, id }));
    }
    if (scope === ScopeEnum.PRODUCT) {
      return productIds.map((id) => ({ kind: 'product' as const, id }));
    }
    if (scope === ScopeEnum.VARIANT) {
      return variantIds.map((id) => ({ kind: 'variant' as const, id }));
    }
    return [];
  }

  /**
   * Validate discount rules before create/update. Throws BadRequestException if rules are violated.
   * Call this when status is or will be ACTIVE; when status is INACTIVE we skip conflict checks.
   */
  async validateActiveDiscountRules(
    input: ValidateDiscountInput,
  ): Promise<void> {
    const {
      excludeDiscountId,
      type,
      scope,
      currency,
      campaignIds,
      productIds,
      variantIds,
      status,
    } = input;

    if (type === TypeEnum.FIXED && (currency == null || currency === '')) {
      throw new BadRequestException(
        'Currency is required for FIXED discounts.',
      );
    }

    if (status !== 'ACTIVE') {
      return;
    }

    const subjects = this.getSubjects({
      scope,
      campaignIds,
      productIds,
      variantIds,
    });
    if (subjects.length === 0) {
      throw new BadRequestException(
        'At least one subject is required: for ORDER scope add no links (sitewide); for CAMPAIGN/PRODUCT/VARIANT add at least one link.',
      );
    }

    const now = new Date();
    const dateFilter = {
      OR: [
        { startAt: null, endAt: null },
        { startAt: { lte: now }, endAt: null },
        { startAt: null, endAt: { gte: now } },
        { startAt: { lte: now }, endAt: { gte: now } },
      ],
    };

    for (const subject of subjects) {
      if (subject.kind === 'sitewide') {
        const existing = await this.prisma.discount.findFirst({
          where: {
            id: excludeDiscountId ? { not: excludeDiscountId } : undefined,
            status: 'ACTIVE',
            scope: ScopeEnum.ORDER,
            ...dateFilter,
            campaigns: { none: {} },
            products: { none: {} },
            variants: { none: {} },
          },
        });
        if (existing) {
          throw new BadRequestException(
            `Another active discount already applies sitewide (${existing.type}). Only one active discount per subject is allowed; percentage and fixed cannot both be active for the same subject.`,
          );
        }
        continue;
      }

      const subjectId = subject.id!;
      if (subject.kind === 'campaign') {
        const existingAny = await this.prisma.discount.findFirst({
          where: {
            id: excludeDiscountId ? { not: excludeDiscountId } : undefined,
            status: 'ACTIVE',
            scope: ScopeEnum.CAMPAIGN,
            ...dateFilter,
            campaigns: { some: { campaignId: subjectId } },
          },
        });
        if (existingAny) {
          if (type === TypeEnum.PERCENTAGE) {
            throw new BadRequestException(
              `Campaign ${subjectId} already has an active discount. Only one active discount per campaign; percentage and fixed cannot both be active.`,
            );
          }
          if (
            type === TypeEnum.FIXED &&
            existingAny.type === TypeEnum.FIXED &&
            existingAny.currency === currency
          ) {
            throw new BadRequestException(
              `Campaign ${subjectId} already has an active FIXED discount for currency ${currency}. Only one active FIXED per (campaign, currency) allowed.`,
            );
          }
          if (
            type === TypeEnum.FIXED &&
            existingAny.type === TypeEnum.PERCENTAGE
          ) {
            throw new BadRequestException(
              `Campaign ${subjectId} already has an active percentage discount. Percentage and fixed cannot both be active for the same subject.`,
            );
          }
        }
      }
      if (subject.kind === 'product') {
        const existingAny = await this.prisma.discount.findFirst({
          where: {
            id: excludeDiscountId ? { not: excludeDiscountId } : undefined,
            status: 'ACTIVE',
            scope: ScopeEnum.PRODUCT,
            ...dateFilter,
            products: { some: { productId: subjectId } },
          },
        });
        if (existingAny) {
          if (type === TypeEnum.PERCENTAGE) {
            throw new BadRequestException(
              `Product ${subjectId} already has an active discount. Only one active discount per product.`,
            );
          }
          if (
            type === TypeEnum.FIXED &&
            existingAny.type === TypeEnum.FIXED &&
            existingAny.currency === currency
          ) {
            throw new BadRequestException(
              `Product ${subjectId} already has an active FIXED discount for currency ${currency}.`,
            );
          }
          if (
            type === TypeEnum.FIXED &&
            existingAny.type === TypeEnum.PERCENTAGE
          ) {
            throw new BadRequestException(
              `Product ${subjectId} already has an active percentage discount. Percentage and fixed cannot both be active.`,
            );
          }
        }
      }
      if (subject.kind === 'variant') {
        const existingAny = await this.prisma.discount.findFirst({
          where: {
            id: excludeDiscountId ? { not: excludeDiscountId } : undefined,
            status: 'ACTIVE',
            scope: ScopeEnum.VARIANT,
            ...dateFilter,
            variants: { some: { variantId: subjectId } },
          },
        });
        if (existingAny) {
          if (type === TypeEnum.PERCENTAGE) {
            throw new BadRequestException(
              `Variant ${subjectId} already has an active discount. Only one active discount per variant.`,
            );
          }
          if (
            type === TypeEnum.FIXED &&
            existingAny.type === TypeEnum.FIXED &&
            existingAny.currency === currency
          ) {
            throw new BadRequestException(
              `Variant ${subjectId} already has an active FIXED discount for currency ${currency}.`,
            );
          }
          if (
            type === TypeEnum.FIXED &&
            existingAny.type === TypeEnum.PERCENTAGE
          ) {
            throw new BadRequestException(
              `Variant ${subjectId} already has an active percentage discount. Percentage and fixed cannot both be active.`,
            );
          }
        }
      }
    }
  }

  async findAll() {
    return this.prisma.discount.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        campaigns: {
          include: {
            campaign: { select: { id: true, title: true, slug: true } },
          },
        },
        products: {
          include: {
            product: { select: { id: true, name: true, slug: true } },
          },
        },
        variants: {
          include: { variant: { select: { id: true, name: true, sku: true } } },
        },
      },
    });
  }

  async findOne(id: string) {
    const discount = await this.prisma.discount.findUnique({
      where: { id },
      include: {
        campaigns: {
          include: {
            campaign: { select: { id: true, title: true, slug: true } },
          },
        },
        products: {
          include: {
            product: { select: { id: true, name: true, slug: true } },
          },
        },
        variants: {
          include: { variant: { select: { id: true, name: true, sku: true } } },
        },
      },
    });
    if (!discount) {
      throw new NotFoundException('Discount not found');
    }
    return discount;
  }

  async create(data: {
    code?: string;
    type: DiscountType;
    scope: DiscountScope;
    status?: DiscountStatus;
    valuePercent?: number;
    valueAmount?: number;
    currency?: string | null;
    minOrderAmount?: number;
    startAt?: Date | null;
    endAt?: Date | null;
    maxRedemptions?: number | null;
    campaignIds?: string[];
    productIds?: string[];
    variantIds?: string[];
  }) {
    const campaignIds = data.campaignIds ?? [];
    const productIds = data.productIds ?? [];
    const variantIds = data.variantIds ?? [];
    const status = (data.status as DiscountStatus) ?? 'ACTIVE';

    await this.validateActiveDiscountRules({
      type: data.type,
      scope: data.scope,
      currency: data.currency ?? null,
      campaignIds,
      productIds,
      variantIds,
      status,
    });

    return this.prisma.$transaction(async (tx) => {
      const discount = await tx.discount.create({
        data: {
          code: data.code,
          type: data.type,
          scope: data.scope,
          status: status as 'ACTIVE' | 'INACTIVE',
          valuePercent: data.valuePercent,
          valueAmount: data.valueAmount,
          currency: data.currency as 'NGN' | undefined,
          minOrderAmount: data.minOrderAmount,
          startAt: data.startAt ?? undefined,
          endAt: data.endAt ?? undefined,
          maxRedemptions: data.maxRedemptions ?? undefined,
        },
      });
      for (const campaignId of campaignIds) {
        await tx.discountCampaign.create({
          data: { discountId: discount.id, campaignId },
        });
      }
      for (const productId of productIds) {
        await tx.discountProduct.create({
          data: { discountId: discount.id, productId },
        });
      }
      for (const variantId of variantIds) {
        await tx.discountVariant.create({
          data: { discountId: discount.id, variantId },
        });
      }
      await this.syncActiveLocks(tx, {
        discountId: discount.id,
        type: data.type,
        scope: data.scope,
        status,
        currency: data.currency ?? null,
        campaignIds,
        productIds,
        variantIds,
      });
      return this.findOne(discount.id);
    });
  }

  async update(
    id: string,
    data: {
      code?: string;
      status?: DiscountStatus;
      valuePercent?: number;
      valueAmount?: number;
      currency?: string | null;
      minOrderAmount?: number;
      startAt?: Date | null;
      endAt?: Date | null;
      maxRedemptions?: number | null;
      campaignIds?: string[];
      productIds?: string[];
      variantIds?: string[];
    },
  ) {
    const existing = await this.prisma.discount.findUnique({
      where: { id },
      include: { campaigns: true, products: true, variants: true },
    });
    if (!existing) {
      throw new NotFoundException('Discount not found');
    }

    const campaignIds =
      data.campaignIds ?? existing.campaigns.map((c) => c.campaignId);
    const productIds =
      data.productIds ?? existing.products.map((p) => p.productId);
    const variantIds =
      data.variantIds ?? existing.variants.map((v) => v.variantId);

    const status = (data.status as DiscountStatus) ?? existing.status;
    const currency = data.currency ?? existing.currency;

    if (
      existing.type === TypeEnum.FIXED &&
      status === 'ACTIVE' &&
      (currency == null || currency === '')
    ) {
      throw new BadRequestException(
        'Currency is required for FIXED discounts.',
      );
    }

    await this.validateActiveDiscountRules({
      excludeDiscountId: id,
      type: existing.type,
      scope: existing.scope,
      currency: currency ?? null,
      campaignIds,
      productIds,
      variantIds,
      status: status,
    });

    return this.prisma.$transaction(async (tx) => {
      await tx.discount.update({
        where: { id },
        data: {
          code: data.code,
          status: data.status as 'ACTIVE' | 'INACTIVE' | undefined,
          valuePercent: data.valuePercent,
          valueAmount: data.valueAmount,
          currency: data.currency as 'NGN' | undefined,
          minOrderAmount: data.minOrderAmount,
          startAt: data.startAt ?? undefined,
          endAt: data.endAt ?? undefined,
          maxRedemptions: data.maxRedemptions ?? undefined,
        },
      });
      const existingWithLinks = await tx.discount.findUnique({
        where: { id },
        include: { campaigns: true, products: true, variants: true },
      });
      if (existingWithLinks) {
        await tx.discountCampaign.deleteMany({ where: { discountId: id } });
        await tx.discountProduct.deleteMany({ where: { discountId: id } });
        await tx.discountVariant.deleteMany({ where: { discountId: id } });
        for (const campaignId of campaignIds) {
          await tx.discountCampaign.create({
            data: { discountId: id, campaignId },
          });
        }
        for (const productId of productIds) {
          await tx.discountProduct.create({
            data: { discountId: id, productId },
          });
        }
        for (const variantId of variantIds) {
          await tx.discountVariant.create({
            data: { discountId: id, variantId },
          });
        }
      }
      await this.syncActiveLocks(tx, {
        discountId: id,
        type: existing.type,
        scope: existing.scope,
        status,
        currency: currency ?? null,
        campaignIds,
        productIds,
        variantIds,
      });
      return this.findOne(id);
    });
  }

  private async syncActiveLocks(
    tx: Prisma.TransactionClient,
    input: {
      discountId: string;
      type: DiscountType;
      scope: DiscountScope;
      status: DiscountStatus;
      currency: string | null;
      campaignIds: string[];
      productIds: string[];
      variantIds: string[];
    },
  ): Promise<void> {
    await tx.discountActiveLock.deleteMany({
      where: { discountId: input.discountId },
    });
    if (input.status !== 'ACTIVE') {
      return;
    }
    const subjects = this.getSubjects({
      scope: input.scope,
      campaignIds: input.campaignIds,
      productIds: input.productIds,
      variantIds: input.variantIds,
    });
    const currencyKey =
      input.type === TypeEnum.PERCENTAGE
        ? '*'
        : (input.currency ?? '').toUpperCase();
    if (input.type === TypeEnum.FIXED && !currencyKey) {
      throw new BadRequestException(
        'Currency is required for FIXED discounts.',
      );
    }
    for (const subject of subjects) {
      const subjectKind =
        subject.kind === 'sitewide' ? 'SITEWIDE' : subject.kind.toUpperCase();
      const subjectId = subject.id ?? '';
      try {
        await tx.discountActiveLock.create({
          data: {
            discountId: input.discountId,
            subjectKind,
            subjectId,
            currencyKey,
          },
        });
      } catch (err: unknown) {
        if (
          err instanceof Prisma.PrismaClientKnownRequestError &&
          err.code === 'P2002'
        ) {
          throw new BadRequestException(
            `Another active discount already locks subject ${subjectKind}:${subjectId || 'sitewide'} (${currencyKey}).`,
          );
        }
        const message = err instanceof Error ? err.message : String(err);
        if (/conflicts with active/i.test(message)) {
          throw new BadRequestException(message);
        }
        throw err;
      }
    }
  }
}
