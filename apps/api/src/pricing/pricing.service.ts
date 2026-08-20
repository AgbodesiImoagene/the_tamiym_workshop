import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEFAULT_CURRENCY } from '../constants';
import type {
  PricingLineItemInput,
  PricingLineItemOutput,
  PricingBreakdown,
  QuoteResult,
  ShippingBreakdown,
  QuoteMode,
} from './pricing.types';
import type { QuoteRequestDto } from './dto/quote-request.dto';
import { roundToMinor, roundToDisplayGranularity } from './currency-rounding';
import { ShippingDestinationResolver } from '../shipping/shipping-destination-resolver.service';
import { ShippingRateEngine } from '../shipping/shipping-rate-engine.service';
import { CampaignStatus } from '../generated/prisma/enums';
import type {
  CanonicalShippingAddress,
  ShipmentSummary,
  ShipmentSummaryLine,
} from '../shipping/shipping.types';

type ComputedLineItem = {
  output: PricingLineItemOutput;
  shipment: ShipmentSummaryLine;
};

/**
 * Single source of truth for standard and campaign checkout pricing.
 * Pipeline: base price → option upcharge → bulk (standard only) → view surcharge → discounts → unit/line totals → shipping → VAT → rounding.
 */
@Injectable()
export class PricingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly shippingDestinationResolver: ShippingDestinationResolver,
    private readonly shippingRateEngine: ShippingRateEngine,
  ) {}

  /**
   * Get a quote for a standard order (no campaign). Uses product/variant prices, bulk pricing, view surcharges, and standard discounts.
   */
  async quoteStandard(
    userId: string,
    dto: QuoteRequestDto,
  ): Promise<QuoteResult> {
    const address = await this.validateAddressForUser(
      dto.shippingAddressId,
      userId,
    );
    const items: PricingLineItemInput[] = dto.items.map((i) => ({
      variantId: i.variantId,
      designId: i.designId ?? null,
      campaignId: null,
      quantity: i.quantity,
    }));
    return this.runPipeline(items, address, 'standard', null);
  }

  /**
   * Get a quote for a campaign order. All items must belong to the same campaign. Buyer price from campaign product price; only campaign discounts; no view surcharge for buyer; organizer cost basis may include views.
   */
  async quoteCampaign(
    userId: string,
    campaignId: string,
    dto: QuoteRequestDto,
  ): Promise<QuoteResult> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { id: true, status: true, endDate: true },
    });
    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }
    if (campaign.status !== CampaignStatus.ACTIVE) {
      throw new BadRequestException('Campaign is not active');
    }
    if (campaign.endDate && campaign.endDate.getTime() <= Date.now()) {
      throw new BadRequestException('Campaign has ended');
    }
    const address = await this.validateAddressForUser(
      dto.shippingAddressId,
      userId,
    );
    const items: PricingLineItemInput[] = dto.items.map((i) => ({
      variantId: i.variantId,
      designId: i.designId ?? null,
      campaignId: campaignId,
      quantity: i.quantity,
    }));
    return this.runPipeline(items, address, 'campaign', campaignId);
  }

  private async validateAddressForUser(
    addressId: string,
    userId: string,
  ): Promise<CanonicalShippingAddress> {
    const address = await this.prisma.address.findUnique({
      where: { id: addressId },
      select: {
        id: true,
        userId: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        state: true,
        postalCode: true,
        country: true,
        countryCode: true,
        locality: true,
        dependentLocality: true,
        administrativeAreaLevel1: true,
        administrativeAreaLevel2: true,
        stateCode: true,
        lgaId: true,
      },
    });
    if (!address) {
      throw new NotFoundException('Shipping address not found');
    }
    if (address.userId !== userId) {
      throw new ForbiddenException('Access denied to this address');
    }
    return address;
  }

  private async runPipeline(
    items: PricingLineItemInput[],
    address: CanonicalShippingAddress,
    mode: QuoteMode,
    campaignId: string | null,
  ): Promise<QuoteResult> {
    if (!items.length) {
      throw new BadRequestException('At least one item is required');
    }

    const siteSettings = await this.getSiteSettings();
    const currency = siteSettings.currency;

    const lineOutputs: PricingLineItemOutput[] = [];
    const shipmentLines: ShipmentSummaryLine[] = [];
    for (const item of items) {
      const computed = await this.computeLineItem(
        item,
        mode,
        campaignId,
        currency,
      );
      lineOutputs.push(computed.output);
      shipmentLines.push(computed.shipment);
    }

    const subtotalAmount = roundToMinor(
      lineOutputs.reduce((sum, l) => sum + l.lineTotal, 0),
      currency,
    );
    const discountAmount = roundToMinor(
      lineOutputs.reduce(
        (sum, l) => sum + l.unitDiscountAmount * l.quantity,
        0,
      ),
      currency,
    );
    const shipmentSummary = this.buildShipmentSummary(shipmentLines);
    const shippingBreakdown = await this.computeShipping(
      address,
      currency,
      siteSettings.vatAppliesToShipping,
      shipmentSummary,
    );
    const shippingFee = shippingBreakdown ? shippingBreakdown.appliedFee : 0;
    const taxableAmount =
      subtotalAmount -
      discountAmount +
      (siteSettings.vatAppliesToShipping ? shippingFee : 0);
    const vatAmount = roundToMinor(
      Number(siteSettings.vatRate) * taxableAmount,
      currency,
    );
    const totalBeforeDisplayRounding =
      subtotalAmount -
      discountAmount +
      shippingFee +
      (siteSettings.pricesIncludeVat ? 0 : vatAmount);
    const totalAmount = roundToDisplayGranularity(
      totalBeforeDisplayRounding,
      currency,
    );

    const appliedDiscountId = lineOutputs.find(
      (l) => l.appliedDiscountId != null,
    )?.appliedDiscountId;

    return {
      currency,
      items: lineOutputs,
      subtotalAmount,
      discountAmount,
      appliedDiscountId: appliedDiscountId ?? undefined,
      shippingFee,
      vatAmount,
      totalAmount,
      shippingBreakdown,
    };
  }

  private async getSiteSettings(): Promise<{
    vatRate: number;
    pricesIncludeVat: boolean;
    vatAppliesToShipping: boolean;
    currency: string;
  }> {
    const settings = await this.prisma.siteSettings.findUnique({
      where: { id: 'default' },
    });
    if (!settings) {
      return {
        vatRate: 0,
        pricesIncludeVat: true,
        vatAppliesToShipping: true,
        currency: DEFAULT_CURRENCY,
      };
    }
    return {
      vatRate: Number(settings.vatRate),
      pricesIncludeVat: settings.pricesIncludeVat,
      vatAppliesToShipping: settings.vatAppliesToShipping,
      currency: settings.currency,
    };
  }

  private async computeLineItem(
    item: PricingLineItemInput,
    mode: QuoteMode,
    campaignId: string | null,
    currency: string,
  ): Promise<ComputedLineItem> {
    const variant = await this.prisma.productVariant.findUnique({
      where: { id: item.variantId },
      include: {
        product: {
          include: {
            prices: { where: { currency: currency as any }, take: 1 },
            bulkPricingTiers: {
              where: { currency: currency as any },
              orderBy: { minQuantity: 'asc' },
            },
          },
        },
        prices: { where: { currency: currency as any }, take: 1 },
        bulkPricing: {
          where: { currency: currency as any },
          orderBy: { minQuantity: 'asc' },
        },
        optionValues: {
          include: {
            option: { select: { name: true, code: true } },
            optionValue: {
              select: { displayName: true, valueCode: true },
              include: {
                upcharges: { where: { currency: currency as any }, take: 1 },
              },
            },
          },
        },
        productViewPricings: {
          include: { productView: true },
          where: { currency: currency as any },
        },
      },
    });

    if (!variant) {
      throw new BadRequestException(`Variant ${item.variantId} not found`);
    }
    const productId = variant.productId;
    if (!variant.isAvailable) {
      throw new BadRequestException(
        `Variant ${item.variantId} is not available`,
      );
    }

    const variantSnapshot = variant.optionValues.map((vov) => ({
      option: vov.option.name,
      optionCode: vov.option.code,
      value: vov.optionValue.displayName,
      valueCode: vov.optionValue.valueCode,
    }));

    let unitBasePrice: number;
    let organizerCostBasis: number | null = null;

    if (mode === 'campaign' && campaignId && item.designId !== undefined) {
      const campaignProduct = await this.prisma.campaignProduct.findFirst({
        where: {
          campaignId,
          productId,
          designId: item.designId || null,
        },
        include: {
          prices: { where: { currency: currency as any }, take: 1 },
        },
      });
      if (!campaignProduct) {
        throw new BadRequestException(
          `Product ${productId} is not in campaign ${campaignId} for the given design`,
        );
      }
      const cpPrice = campaignProduct.prices[0];
      if (!cpPrice) {
        throw new BadRequestException(
          `No campaign price for product ${productId}`,
        );
      }
      unitBasePrice = Number(cpPrice.amount);
      // Organizer cost: base from product/variant + view surcharges (for payout math)
      const orgBase = this.resolveBaseUnitPrice(variant);
      const viewSurchargeForOrg = await this.computeViewSurchargeForDesign(
        variant.id,
        variant.productId,
        item.designId,
        currency,
      );
      organizerCostBasis = roundToMinor(
        orgBase + viewSurchargeForOrg,
        currency,
      );
    } else {
      unitBasePrice = this.resolveBaseUnitPrice(variant);
    }

    if (unitBasePrice <= 0) {
      throw new BadRequestException(
        `No price found for product ${productId} / variant ${item.variantId}`,
      );
    }

    const optionUpcharge = this.sumOptionValueUpcharges(variant, currency);
    let bulkAdjustment = 0;
    if (mode === 'standard') {
      const bulkTier = this.getBulkTier(variant, item.quantity);
      if (bulkTier) {
        const tierPrice = Number(bulkTier.pricePerUnit);
        bulkAdjustment = roundToMinor(tierPrice - unitBasePrice, currency);
      }
    }

    const baseAfterBulk = roundToMinor(
      unitBasePrice + optionUpcharge + bulkAdjustment,
      currency,
    );
    let unitViewSurcharge = 0;
    if (mode === 'standard' && item.designId) {
      unitViewSurcharge = await this.computeViewSurchargeForDesign(
        variant.id,
        variant.productId,
        item.designId,
        currency,
      );
    }
    if (mode === 'campaign' && organizerCostBasis !== null) {
      unitViewSurcharge = 0; // buyer does not pay view surcharge
    }

    const unitBeforeDiscount = roundToMinor(
      baseAfterBulk + unitViewSurcharge,
      currency,
    );
    let unitDiscountAmount = 0;
    let appliedDiscountId: string | null = null;
    if (mode === 'campaign' && campaignId) {
      const discountResult = await this.computeCampaignDiscount(
        campaignId,
        item,
        unitBeforeDiscount,
        currency,
      );
      unitDiscountAmount = discountResult.amount;
      appliedDiscountId = discountResult.discountId;
    }
    const unitFinalPrice = roundToMinor(
      Math.max(0, unitBeforeDiscount - unitDiscountAmount),
      currency,
    );
    const lineTotal = roundToMinor(unitFinalPrice * item.quantity, currency);
    const pricingBreakdown: PricingBreakdown = {
      version: 1,
      unitBasePrice,
      optionValueUpcharge: optionUpcharge,
      unitViewSurcharge,
      unitDiscountAmount,
      unitFinalPrice,
    };
    if (bulkAdjustment !== 0) {
      pricingBreakdown.bulkAdjustment = bulkAdjustment;
    }
    if (organizerCostBasis !== null) {
      pricingBreakdown.organizerCostBasis = organizerCostBasis;
    }

    return {
      output: {
        productId,
        variantId: item.variantId,
        designId: item.designId,
        campaignId: item.campaignId,
        quantity: item.quantity,
        unitBasePrice,
        unitViewSurcharge,
        unitDiscountAmount,
        unitFinalPrice,
        lineTotal,
        organizerCostBasis,
        appliedDiscountId: appliedDiscountId ?? undefined,
        pricingBreakdown,
        variantSnapshot,
      },
      shipment: {
        productId,
        variantId: item.variantId,
        quantity: item.quantity,
        weightGrams: variant.weightGrams ?? variant.product.weightGrams ?? null,
        packageLengthMm:
          variant.packageLengthMm ?? variant.product.packageLengthMm ?? null,
        packageWidthMm:
          variant.packageWidthMm ?? variant.product.packageWidthMm ?? null,
        packageHeightMm:
          variant.packageHeightMm ?? variant.product.packageHeightMm ?? null,
      },
    };
  }

  private resolveBaseUnitPrice(variant: {
    prices: { amount: unknown }[];
    product: { prices: { amount: unknown }[] };
  }): number {
    const vp = variant.prices[0];
    if (vp) return Number(vp.amount);
    const pp = variant.product.prices[0];
    if (pp) return Number(pp.amount);
    return 0;
  }

  private sumOptionValueUpcharges(
    variant: {
      optionValues: { optionValue: { upcharges: { amount: unknown }[] } }[];
    },
    currency: string,
  ): number {
    let sum = 0;
    for (const vov of variant.optionValues) {
      const u = vov.optionValue.upcharges[0];
      if (u) sum += Number(u.amount);
    }
    return roundToMinor(sum, currency);
  }

  private getBulkTier(
    variant: {
      product: {
        bulkPricingTiers: {
          minQuantity: number;
          maxQuantity: number | null;
          pricePerUnit: unknown;
        }[];
      };
      bulkPricing: {
        minQuantity: number;
        maxQuantity: number | null;
        pricePerUnit: unknown;
      }[];
    },
    quantity: number,
  ): { pricePerUnit: unknown } | null {
    const tiers = variant.bulkPricing.length
      ? variant.bulkPricing
      : variant.product.bulkPricingTiers;
    for (const t of tiers) {
      if (quantity < t.minQuantity) continue;
      if (t.maxQuantity != null && quantity > t.maxQuantity) continue;
      return t;
    }
    return null;
  }

  private async computeViewSurchargeForDesign(
    variantId: string,
    productId: string,
    designId: string | null,
    currency: string,
  ): Promise<number> {
    if (!designId) return 0;
    const designViews = await this.prisma.designView.findMany({
      where: { designId },
      // Stable order is required: the first view is free (no surcharge) and
      // subsequent views each carry a surcharge. Without an explicit orderBy the
      // "first" entry is non-deterministic, making the surcharge calculation
      // inconsistent across requests.
      orderBy: { id: 'asc' },
      include: {
        productView: {
          include: {
            pricingRules: {
              where: {
                productId,
                currency: currency as any,
                OR: [{ variantId: null }, { variantId }],
              },
              take: 1,
            },
          },
        },
      },
    });
    let total = 0;
    let first = true;
    for (const dv of designViews) {
      if (first) {
        first = false;
        continue;
      }
      const rule = dv.productView.pricingRules?.[0];
      if (rule) total += Number(rule.surchargeAmount);
    }
    return roundToMinor(total, currency);
  }

  /**
   * Max organizer cost basis for a product (and optional design) across all its variants.
   * Used to enforce minimum campaign product price: effectiveFloor = variant base price + view/design surcharge per variant; no option upcharges.
   * Returns 0 if the product has no variants or none have a resolvable base price.
   */
  async getMinCampaignProductPrice(
    productId: string,
    designId: string | null,
    currency: string,
  ): Promise<number> {
    const variants = await this.prisma.productVariant.findMany({
      where: { productId },
      include: {
        prices: { where: { currency: currency as any }, take: 1 },
        product: {
          select: {
            prices: { where: { currency: currency as any }, take: 1 },
          },
        },
      },
    });
    if (variants.length === 0) return 0;
    let maxBasis = 0;
    for (const variant of variants) {
      const base = this.resolveBaseUnitPrice(variant);
      const surcharge = await this.computeViewSurchargeForDesign(
        variant.id,
        productId,
        designId,
        currency,
      );
      const basis = roundToMinor(base + surcharge, currency);
      if (basis > maxBasis) maxBasis = basis;
    }
    return maxBasis;
  }

  /**
   * Find an active discount linked to this campaign and apply it to the unit price.
   * Uses the first matching DiscountCampaign with valid dates; applies PERCENTAGE or FIXED per unit.
   * Returns amount and discountId for OrderDiscount persistence.
   */
  private async computeCampaignDiscount(
    campaignId: string,
    item: PricingLineItemInput,
    unitBeforeDiscount: number,
    currency: string,
  ): Promise<{ amount: number; discountId: string | null }> {
    const now = new Date();
    const link = await this.prisma.discountCampaign.findFirst({
      where: {
        campaignId,
        discount: {
          status: 'ACTIVE',
          scope: 'CAMPAIGN',
          OR: [
            { startAt: null, endAt: null },
            { startAt: { lte: now }, endAt: null },
            { startAt: null, endAt: { gte: now } },
            { startAt: { lte: now }, endAt: { gte: now } },
          ],
        },
      },
      include: { discount: true },
    });
    const discount = link?.discount;
    if (!discount) return { amount: 0, discountId: null };
    let amount = 0;
    if (discount.valuePercent != null) {
      amount = roundToMinor(
        (unitBeforeDiscount * Number(discount.valuePercent)) / 100,
        currency,
      );
    } else if (discount.valueAmount != null && discount.currency === currency) {
      const fixedPerUnit = Number(discount.valueAmount) / item.quantity;
      amount = roundToMinor(
        Math.min(fixedPerUnit, unitBeforeDiscount),
        currency,
      );
    }
    return { amount, discountId: discount.id };
  }

  private buildShipmentSummary(lines: ShipmentSummaryLine[]): ShipmentSummary {
    const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
    const totalWeightGrams = lines.every((line) => line.weightGrams != null)
      ? lines.reduce(
          (sum, line) => sum + Number(line.weightGrams ?? 0) * line.quantity,
          0,
        )
      : null;
    const packageLengthMm = this.maxDimension(
      lines.map((line) => line.packageLengthMm),
    );
    const packageWidthMm = this.maxDimension(
      lines.map((line) => line.packageWidthMm),
    );
    const packageHeightMm = lines.every((line) => line.packageHeightMm != null)
      ? lines.reduce(
          (sum, line) =>
            sum + Number(line.packageHeightMm ?? 0) * line.quantity,
          0,
        )
      : null;

    return {
      totalQuantity,
      totalWeightGrams,
      packageLengthMm,
      packageWidthMm,
      packageHeightMm,
      lineItems: lines,
    };
  }

  private maxDimension(values: Array<number | null>) {
    const filtered = values.filter((value): value is number => value != null);
    if (filtered.length !== values.length) {
      return null;
    }
    return filtered.length ? Math.max(...filtered) : null;
  }

  private async computeShipping(
    address: CanonicalShippingAddress,
    currency: string,
    vatAppliedToShipping: boolean,
    shipment: ShipmentSummary,
  ): Promise<ShippingBreakdown | null> {
    const destination =
      await this.shippingDestinationResolver.resolveAddress(address);
    if (!destination) {
      return null;
    }

    return this.shippingRateEngine.quote({
      destination,
      currency,
      shipment,
      vatAppliedToShipping,
    });
  }
}
