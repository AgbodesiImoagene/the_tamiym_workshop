import { Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { Prisma } from '../generated/prisma/client';
import { AuditAction, CurrencyCode } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

export interface OptionValueUpchargeView {
  optionId: string;
  valueId: string;
  currency: CurrencyCode;
  /** Decimal string with 2 places, e.g. "500.00". */
  amount: string;
}

export interface ViewSurchargeView {
  viewId: string;
  currency: CurrencyCode;
  /** Decimal string with 2 places, e.g. "1000.00". */
  amount: string;
}

export interface ProductSurchargesView {
  optionValueUpcharges: OptionValueUpchargeView[];
  viewSurcharges: ViewSurchargeView[];
}

type AmountSnapshot = { currency: CurrencyCode; amount: string } | null;

/** Currency amounts are written to Decimal(10, 2) columns as 2-place strings. */
function toAmountString(amount: number): string {
  return amount.toFixed(2);
}

function toDecimalString(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

/**
 * TTW-094: admin writes for `OptionValueUpcharge` (size surcharges) and
 * `ProductViewPricing` (print-side surcharges).
 *
 * - Every write checks that the option value / view belongs to the product in
 *   the URL, so one product's id can never write another product's price.
 * - Writes are idempotent and enforced by the database: the option upcharge
 *   uses the `(optionValueId, currency)` unique key; the print-side surcharge
 *   uses the partial unique index on product-level rows (`variantId IS NULL`),
 *   with a P2002 fallback to an update when two writes race.
 * - Only product-level view surcharges are written here. Variant-level rows
 *   (`variantId` set) are still read by pricing but never changed by these
 *   routes.
 * - Orders keep their own price snapshot, so a change here is never retroactive.
 */
@Injectable()
export class ProductSurchargesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listForProduct(productId: string): Promise<ProductSurchargesView> {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { id: true },
    });
    if (!product) {
      throw new NotFoundException('Product not found');
    }
    const [upcharges, viewRows] = await Promise.all([
      this.prisma.optionValueUpcharge.findMany({
        where: { optionValue: { option: { productId } } },
        include: { optionValue: { select: { optionId: true } } },
        orderBy: [{ optionValueId: 'asc' }, { currency: 'asc' }],
      }),
      this.prisma.productViewPricing.findMany({
        where: { productId, variantId: null },
        orderBy: [{ productViewId: 'asc' }, { currency: 'asc' }],
      }),
    ]);
    return {
      optionValueUpcharges: upcharges.map((row) => ({
        optionId: row.optionValue.optionId,
        valueId: row.optionValueId,
        currency: row.currency,
        amount: toDecimalString(row.amount),
      })),
      viewSurcharges: viewRows.map((row) => ({
        viewId: row.productViewId,
        currency: row.currency,
        amount: toDecimalString(row.surchargeAmount),
      })),
    };
  }

  async setOptionValueUpcharge(
    productId: string,
    optionId: string,
    valueId: string,
    currency: CurrencyCode,
    amount: number,
  ): Promise<OptionValueUpchargeView> {
    await this.assertOptionValueOwned(productId, optionId, valueId);
    const amountString = toAmountString(amount);
    const before = await this.readOptionValueUpcharge(valueId, currency);

    await this.prisma.optionValueUpcharge.upsert({
      where: { optionValueId_currency: { optionValueId: valueId, currency } },
      create: { optionValueId: valueId, currency, amount: amountString },
      update: { amount: amountString },
    });

    const after: AmountSnapshot = { currency, amount: amountString };
    await this.audit.log({
      eventName: 'catalog.option_value_upcharge.set',
      action: before ? AuditAction.UPDATE : AuditAction.CREATE,
      entityType: 'OptionValueUpcharge',
      entityId: valueId,
      targetType: 'Product',
      targetId: productId,
      before,
      after,
      metadata: { optionId },
    });
    return { optionId, valueId, currency, amount: amountString };
  }

  async deleteOptionValueUpcharge(
    productId: string,
    optionId: string,
    valueId: string,
    currency: CurrencyCode,
  ): Promise<void> {
    await this.assertOptionValueOwned(productId, optionId, valueId);
    const before = await this.readOptionValueUpcharge(valueId, currency);
    const { count } = await this.prisma.optionValueUpcharge.deleteMany({
      where: { optionValueId: valueId, currency },
    });
    if (before && count > 0) {
      await this.audit.log({
        eventName: 'catalog.option_value_upcharge.delete',
        action: AuditAction.DELETE,
        entityType: 'OptionValueUpcharge',
        entityId: valueId,
        targetType: 'Product',
        targetId: productId,
        before,
        after: null,
        metadata: { optionId },
      });
    }
  }

  async setViewSurcharge(
    productId: string,
    viewId: string,
    currency: CurrencyCode,
    amount: number,
  ): Promise<ViewSurchargeView> {
    await this.assertViewOwned(productId, viewId);
    const amountString = toAmountString(amount);
    const before = await this.readViewSurcharge(productId, viewId, currency);
    const where = {
      productId,
      productViewId: viewId,
      currency,
      variantId: null,
    };

    const updated = await this.prisma.productViewPricing.updateMany({
      where,
      data: { surchargeAmount: amountString },
    });
    if (updated.count === 0) {
      try {
        await this.prisma.productViewPricing.create({
          data: {
            productId,
            productViewId: viewId,
            variantId: null,
            currency,
            surchargeAmount: amountString,
          },
        });
      } catch (error) {
        // A concurrent write created the row between our update and insert:
        // the partial unique index refused ours, so update the winner's row.
        if (!this.isUniqueViolation(error)) throw error;
        await this.prisma.productViewPricing.updateMany({
          where,
          data: { surchargeAmount: amountString },
        });
      }
    }

    const after: AmountSnapshot = { currency, amount: amountString };
    await this.audit.log({
      eventName: 'catalog.view_surcharge.set',
      action: before ? AuditAction.UPDATE : AuditAction.CREATE,
      entityType: 'ProductViewPricing',
      entityId: viewId,
      targetType: 'Product',
      targetId: productId,
      before,
      after,
    });
    return { viewId, currency, amount: amountString };
  }

  async deleteViewSurcharge(
    productId: string,
    viewId: string,
    currency: CurrencyCode,
  ): Promise<void> {
    await this.assertViewOwned(productId, viewId);
    const before = await this.readViewSurcharge(productId, viewId, currency);
    const { count } = await this.prisma.productViewPricing.deleteMany({
      where: {
        productId,
        productViewId: viewId,
        currency,
        variantId: null,
      },
    });
    if (before && count > 0) {
      await this.audit.log({
        eventName: 'catalog.view_surcharge.delete',
        action: AuditAction.DELETE,
        entityType: 'ProductViewPricing',
        entityId: viewId,
        targetType: 'Product',
        targetId: productId,
        before,
        after: null,
      });
    }
  }

  private async assertOptionValueOwned(
    productId: string,
    optionId: string,
    valueId: string,
  ): Promise<void> {
    const value = await this.prisma.productOptionValue.findFirst({
      where: { id: valueId, optionId, option: { productId } },
      select: { id: true },
    });
    if (!value) {
      throw new NotFoundException('Option value not found');
    }
  }

  private async assertViewOwned(
    productId: string,
    viewId: string,
  ): Promise<void> {
    const view = await this.prisma.productView.findFirst({
      where: { id: viewId, productId },
      select: { id: true },
    });
    if (!view) {
      throw new NotFoundException('Product view not found');
    }
  }

  private async readOptionValueUpcharge(
    valueId: string,
    currency: CurrencyCode,
  ): Promise<AmountSnapshot> {
    const row = await this.prisma.optionValueUpcharge.findUnique({
      where: { optionValueId_currency: { optionValueId: valueId, currency } },
      select: { amount: true },
    });
    return row ? { currency, amount: toDecimalString(row.amount) } : null;
  }

  private async readViewSurcharge(
    productId: string,
    viewId: string,
    currency: CurrencyCode,
  ): Promise<AmountSnapshot> {
    const row = await this.prisma.productViewPricing.findFirst({
      where: {
        productId,
        productViewId: viewId,
        currency,
        variantId: null,
      },
      select: { surchargeAmount: true },
    });
    return row
      ? { currency, amount: toDecimalString(row.surchargeAmount) }
      : null;
  }

  private isUniqueViolation(error: unknown): boolean {
    return (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2002'
    );
  }
}
