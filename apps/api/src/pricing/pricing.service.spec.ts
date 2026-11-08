import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PricingService } from './pricing.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingDestinationResolver } from '../shipping/shipping-destination-resolver.service';
import { ShippingRateEngine } from '../shipping/shipping-rate-engine.service';
import { CampaignStatus } from '../generated/prisma/enums';

describe('PricingService', () => {
  let service: PricingService;
  let prisma: jest.Mocked<PrismaService>;
  let resolver: jest.Mocked<ShippingDestinationResolver>;
  let rateEngine: jest.Mocked<ShippingRateEngine>;

  const mockAddress = {
    id: 'addr-1',
    userId: 'user-1',
    addressLine1: '123 Main',
    addressLine2: null,
    city: 'Lagos',
    state: 'Lagos',
    postalCode: null,
    country: 'Nigeria',
    countryCode: 'NG',
    locality: 'Lagos',
    dependentLocality: null,
    administrativeAreaLevel1: 'Lagos',
    administrativeAreaLevel2: null,
    stateCode: 'LA',
    lgaId: null as string | null,
  };

  const mockSiteSettings = {
    id: 'default',
    vatRate: 0.075,
    pricesIncludeVat: true,
    vatAppliesToShipping: true,
    currency: 'NGN',
  };

  const mockVariant = {
    id: 'var-1',
    productId: 'prod-1',
    isAvailable: true,
    name: 'S',
    sku: 'SKU-S',
    createdAt: new Date(),
    updatedAt: new Date(),
    optionValues: [
      {
        option: { name: 'Size', code: 'size' },
        optionValue: {
          displayName: 'Small',
          valueCode: 'S',
          upcharges: [],
        },
      },
    ],
    prices: [{ amount: 5000 }],
    product: {
      name: 'Classic Tee',
      prices: [],
      bulkPricingTiers: [],
      weightGrams: 300,
      packageLengthMm: 320,
      packageWidthMm: 240,
      packageHeightMm: 40,
    },
    bulkPricing: [],
    productViewPricings: [],
  };

  const mockDestination = {
    countryCode: 'NG',
    zoneId: 'zone-1',
    zoneName: 'Lagos',
    ruleId: 'rule-1',
    matchType: 'ADMIN1',
    matchValue: 'LA',
    matchContext: null,
    resolutionMethod: 'RULE_ADMIN1',
    confidence: 'medium',
  };

  function shippingBreakdownWithFee(appliedFee: number) {
    return {
      version: 2,
      provider: 'INTERNAL',
      rateSource: 'ZONE_FLAT_RATE',
      rateId: 'rate-1',
      zoneId: 'zone-1',
      zoneName: 'Lagos',
      appliedFee,
      currency: 'NGN',
      serviceLevel: 'STANDARD',
      priority: 100,
      vatAppliedToShipping: true,
      resolutionMethod: 'RULE_ADMIN1',
      destination: {
        countryCode: 'NG',
        ruleId: 'rule-1',
        matchType: 'ADMIN1',
        matchValue: 'LA',
        matchContext: null,
        confidence: 'medium',
      },
      estimatedDeliveryMinDays: 2,
      estimatedDeliveryMaxDays: 4,
      shipmentSummary: {
        totalQuantity: 1,
        totalWeightGrams: 300,
        packageLengthMm: 320,
        packageWidthMm: 240,
        packageHeightMm: 40,
        lineItems: [],
      },
    };
  }

  beforeEach(async () => {
    const mockPrisma = {
      address: {
        findUnique: jest.fn().mockResolvedValue(mockAddress),
      },
      siteSettings: {
        findUnique: jest.fn().mockResolvedValue(mockSiteSettings),
      },
      productVariant: {
        findUnique: jest.fn().mockResolvedValue(mockVariant),
        findMany: jest.fn().mockResolvedValue([]),
      },
      shippingZoneArea: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      campaign: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'camp-1',
          status: CampaignStatus.ACTIVE,
          endDate: null,
        }),
      },
      campaignProduct: { findFirst: jest.fn().mockResolvedValue(null) },
      designView: { findMany: jest.fn().mockResolvedValue([]) },
      productViewPricing: { findMany: jest.fn().mockResolvedValue([]) },
      discountCampaign: { findMany: jest.fn().mockResolvedValue([]) },
    };
    // TTW-086: an address outside every zone is refused, so the default
    // fixture is a covered address with an explicit ₦0 rate. Price
    // assertions below are unchanged by shipping.
    const mockResolver = {
      resolveAddress: jest.fn().mockResolvedValue(mockDestination),
    };
    const mockRateEngine = {
      quote: jest.fn().mockResolvedValue(shippingBreakdownWithFee(0)),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PricingService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ShippingDestinationResolver, useValue: mockResolver },
        { provide: ShippingRateEngine, useValue: mockRateEngine },
      ],
    }).compile();

    service = module.get<PricingService>(PricingService);
    prisma = module.get(PrismaService);
    resolver = module.get(ShippingDestinationResolver);
    rateEngine = module.get(ShippingRateEngine);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('quoteStandard', () => {
    it('should throw when items array is empty', async () => {
      await expect(
        service.quoteStandard('user-1', {
          shippingAddressId: 'addr-1',
          items: [],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when address not found', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.quoteStandard('user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 1 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw when address belongs to another user', async () => {
      (prisma.address.findUnique as jest.Mock).mockResolvedValue({
        ...mockAddress,
        userId: 'other-user',
      });
      await expect(
        service.quoteStandard('user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 1 }],
        }),
      ).rejects.toThrow();
    });

    it('should return quote shape with currency, items, totals when variant and address valid', async () => {
      const result = await service.quoteStandard('user-1', {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 2 }],
      });

      expect(result).toMatchObject({
        currency: 'NGN',
        items: [
          {
            productId: 'prod-1',
            variantId: 'var-1',
            quantity: 2,
            unitBasePrice: 5000,
            lineTotal: expect.any(Number),
          },
        ],
        subtotalAmount: expect.any(Number),
        discountAmount: expect.any(Number),
        shippingFee: expect.any(Number),
        vatAmount: expect.any(Number),
        totalAmount: expect.any(Number),
        totalBeforeDisplayRounding: expect.any(Number),
        roundingAdjustment: expect.any(Number),
        vatRate: 0.075,
        pricesIncludeVat: true,
        vatAppliesToShipping: true,
        pricingPolicyVersion: 'ngn-v1-interim-2026-08',
      });
      expect(result.items).toHaveLength(1);
      expect(result.subtotalAmount - result.discountAmount).toBe(
        result.items[0].lineTotal,
      );
      expect(result.totalAmount).toBe(
        result.totalBeforeDisplayRounding + result.roundingAdjustment,
      );
      expect(result.items[0].pricingBreakdown).toBeDefined();
      expect(result.items[0].variantSnapshot).toBeDefined();
      expect(result.items[0].productNameSnapshot).toBe('Classic Tee');
      expect(result.items[0].variantDisplaySnapshot).toBe('S (SKU-S)');
      expect(result.items[0].optionPresentationSnapshot).toEqual(
        result.items[0].variantSnapshot,
      );
    });
  });

  describe('quoteCampaign', () => {
    it('should throw when campaign not found', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue(null);
      await expect(
        service.quoteCampaign('user-1', 'camp-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 1 }],
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should fail closed when multiple active campaign discounts match', async () => {
      (prisma.campaignProduct.findFirst as jest.Mock).mockResolvedValue({
        id: 'cp-1',
        prices: [{ amount: 8000 }],
      });
      (prisma.discountCampaign.findMany as jest.Mock).mockResolvedValue([
        {
          discountId: 'd1',
          discount: {
            id: 'd1',
            status: 'ACTIVE',
            scope: 'CAMPAIGN',
            valuePercent: 10,
            valueAmount: null,
            currency: null,
          },
        },
        {
          discountId: 'd2',
          discount: {
            id: 'd2',
            status: 'ACTIVE',
            scope: 'CAMPAIGN',
            valuePercent: 5,
            valueAmount: null,
            currency: null,
          },
        },
      ]);

      await expect(
        service.quoteCampaign('user-1', 'camp-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should not double-subtract campaign discount from totals', async () => {
      (prisma.campaignProduct.findFirst as jest.Mock).mockResolvedValue({
        id: 'cp-1',
        prices: [{ amount: 10000 }],
      });
      (prisma.discountCampaign.findMany as jest.Mock).mockResolvedValue([
        {
          discountId: 'd1',
          discount: {
            id: 'd1',
            status: 'ACTIVE',
            scope: 'CAMPAIGN',
            valuePercent: 10,
            valueAmount: null,
            currency: null,
          },
        },
      ]);

      const result = await service.quoteCampaign('user-1', 'camp-1', {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 1 }],
      });

      expect(result.subtotalAmount).toBe(10000);
      expect(result.discountAmount).toBe(1000);
      expect(result.items[0].lineTotal).toBe(9000);
      expect(result.subtotalAmount - result.discountAmount).toBe(
        result.items[0].lineTotal,
      );
      // pricesIncludeVat: merchandise net 9000, shipping 0
      expect(result.totalBeforeDisplayRounding).toBe(9000);
      expect(result.totalAmount).toBe(9000);
      expect(result.roundingAdjustment).toBe(0);
      expect(result.appliedDiscountId).toBe('d1');
      // Inclusive VAT extraction: 9000 * 0.075 / 1.075 → minor HALF_EVEN
      expect(result.vatAmount).toBe(627.91);
      expect(result.pricesIncludeVat).toBe(true);
    });

    it('should apply FIXED campaign discount per unit without dividing by quantity', async () => {
      (prisma.campaignProduct.findFirst as jest.Mock).mockResolvedValue({
        id: 'cp-1',
        prices: [{ amount: 5000 }],
      });
      (prisma.discountCampaign.findMany as jest.Mock).mockResolvedValue([
        {
          discountId: 'd-fixed',
          discount: {
            id: 'd-fixed',
            status: 'ACTIVE',
            scope: 'CAMPAIGN',
            valuePercent: null,
            valueAmount: 500,
            currency: 'NGN',
          },
        },
      ]);

      const result = await service.quoteCampaign('user-1', 'camp-1', {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 3 }],
      });

      expect(result.items[0].unitDiscountAmount).toBe(500);
      expect(result.discountAmount).toBe(1500);
      expect(result.subtotalAmount).toBe(15000);
      expect(result.items[0].lineTotal).toBe(13500);
    });

    it('should add exclusive VAT and record non-zero display rounding', async () => {
      (prisma.siteSettings.findUnique as jest.Mock).mockResolvedValue({
        ...mockSiteSettings,
        pricesIncludeVat: false,
        vatRate: 0.075,
      });
      (prisma.campaignProduct.findFirst as jest.Mock).mockResolvedValue({
        id: 'cp-1',
        prices: [{ amount: 9050 }],
      });
      (prisma.discountCampaign.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.quoteCampaign('user-1', 'camp-1', {
        shippingAddressId: 'addr-1',
        items: [{ variantId: 'var-1', quantity: 1 }],
      });

      // exclusive: vat = 9050 * 0.075 = 678.75 → 678.75
      expect(result.pricesIncludeVat).toBe(false);
      expect(result.vatAmount).toBe(678.75);
      expect(result.totalBeforeDisplayRounding).toBe(9728.75);
      // NGN display granularity 100 → 9700
      expect(result.totalAmount).toBe(9700);
      expect(result.roundingAdjustment).toBe(-28.75);
      expect(
        result.totalBeforeDisplayRounding + result.roundingAdjustment,
      ).toBe(result.totalAmount);
    });
  });

  describe('address outside every shipping zone (TTW-086)', () => {
    const dto = {
      shippingAddressId: 'addr-1',
      items: [{ variantId: 'var-1', quantity: 1 }],
    };

    async function expectNotCovered(promise: Promise<unknown>) {
      const error: unknown = await promise.then(
        () => undefined,
        (e: unknown) => e,
      );
      expect(error).toBeInstanceOf(BadRequestException);
      const body = (error as BadRequestException).getResponse();
      expect(body).toMatchObject({
        code: 'SHIPPING_ADDRESS_NOT_COVERED',
        message: expect.stringContaining("We don't deliver to this address"),
      });
    }

    it('refuses a standard quote when no zone matches the address', async () => {
      (resolver.resolveAddress as jest.Mock).mockResolvedValue(null);

      await expectNotCovered(service.quoteStandard('user-1', dto));
      expect(rateEngine.quote).not.toHaveBeenCalled();
    });

    it('refuses a campaign quote when no zone matches the address', async () => {
      (prisma.campaignProduct.findFirst as jest.Mock).mockResolvedValue({
        id: 'cp-1',
        prices: [{ amount: 10000 }],
      });
      (resolver.resolveAddress as jest.Mock).mockResolvedValue(null);

      await expectNotCovered(service.quoteCampaign('user-1', 'camp-1', dto));
    });

    it('refuses a quote when the zone has no active rate', async () => {
      (rateEngine.quote as jest.Mock).mockResolvedValue(null);

      await expectNotCovered(service.quoteStandard('user-1', dto));
    });

    it('logs the reason and coarse location only, never the street or city', async () => {
      const warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      try {
        (resolver.resolveAddress as jest.Mock).mockResolvedValueOnce(null);
        await expectNotCovered(service.quoteStandard('user-1', dto));
        (rateEngine.quote as jest.Mock).mockResolvedValueOnce(null);
        await expectNotCovered(service.quoteStandard('user-1', dto));

        const lines = warn.mock.calls.map(([line]) => String(line));
        expect(lines).toHaveLength(2);
        expect(lines[0]).toContain('reason=NO_ZONE');
        expect(lines[0]).toContain('state=LA');
        expect(lines[1]).toContain('reason=NO_RATE');
        expect(lines[1]).toContain('zone=zone-1');
        for (const line of lines) {
          expect(line).not.toContain(mockAddress.addressLine1);
          expect(line).not.toContain(mockAddress.city);
          expect(line).not.toContain(mockAddress.userId);
        }
      } finally {
        warn.mockRestore();
      }
    });

    it('keeps an explicit ₦0 rate set by an admin', async () => {
      (rateEngine.quote as jest.Mock).mockResolvedValue(
        shippingBreakdownWithFee(0),
      );

      const result = await service.quoteStandard('user-1', dto);

      expect(result.shippingFee).toBe(0);
      expect(result.shippingBreakdown).toMatchObject({ appliedFee: 0 });
    });

    it('applies the matching zone rate to the total', async () => {
      (rateEngine.quote as jest.Mock).mockResolvedValue(
        shippingBreakdownWithFee(2000),
      );

      const result = await service.quoteStandard('user-1', dto);

      expect(result.shippingFee).toBe(2000);
      // Inclusive VAT: merchandise 5000 + shipping 2000.
      expect(result.totalAmount).toBe(7000);
    });
  });

  describe('missing site settings (TTW-084)', () => {
    beforeEach(() => {
      (prisma.siteSettings.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.campaignProduct.findFirst as jest.Mock).mockResolvedValue({
        id: 'cp-1',
        prices: [{ amount: 9050 }],
      });
      (prisma.discountCampaign.findMany as jest.Mock).mockResolvedValue([]);
    });

    it('refuses a standard quote instead of pricing at 0% VAT', async () => {
      await expect(
        service.quoteStandard('user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 1 }],
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('refuses a campaign quote instead of pricing at 0% VAT', async () => {
      await expect(
        service.quoteCampaign('user-1', 'camp-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 1 }],
        }),
      ).rejects.toThrow(ServiceUnavailableException);
    });

    it('reads the default settings row by its fixed id and keeps configuration details out of the client message', async () => {
      await expect(
        service.quoteStandard('user-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 1 }],
        }),
      ).rejects.toThrow(
        'Pricing is temporarily unavailable. Please try again later.',
      );
      expect(prisma.siteSettings.findUnique).toHaveBeenCalledWith({
        where: { id: 'default' },
      });
    });
  });

  describe('quoteCampaign status guards', () => {
    it('should throw when campaign is not active', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        id: 'camp-1',
        status: CampaignStatus.PAUSED,
        endDate: null,
      });

      await expect(
        service.quoteCampaign('user-1', 'camp-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw when campaign endDate has passed', async () => {
      (prisma.campaign.findUnique as jest.Mock).mockResolvedValue({
        id: 'camp-1',
        status: CampaignStatus.ACTIVE,
        endDate: new Date(Date.now() - 60_000),
      });

      await expect(
        service.quoteCampaign('user-1', 'camp-1', {
          shippingAddressId: 'addr-1',
          items: [{ variantId: 'var-1', quantity: 1 }],
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('getMinCampaignProductPrice', () => {
    it('should return 0 when product has no variants', async () => {
      (prisma.productVariant.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getMinCampaignProductPrice(
        'prod-1',
        null,
        'NGN',
      );
      expect(result).toBe(0);
    });

    it('should return max of variant base + view surcharge across variants', async () => {
      const variantA = {
        id: 'var-a',
        productId: 'prod-1',
        prices: [{ amount: 5000 }],
        product: { prices: [] },
      };
      const variantB = {
        id: 'var-b',
        productId: 'prod-1',
        prices: [],
        product: { prices: [{ amount: 4000 }] },
      };
      (prisma.productVariant.findMany as jest.Mock).mockResolvedValue([
        variantA,
        variantB,
      ]);
      (prisma.designView.findMany as jest.Mock).mockResolvedValue([]);

      const result = await service.getMinCampaignProductPrice(
        'prod-1',
        null,
        'NGN',
      );
      expect(result).toBe(5000);
    });
  });

  describe('buildPublicCampaignOffers', () => {
    const baseSource = {
      id: 'cp-1',
      productId: 'prod-1',
      designId: 'design-1',
      product: {
        id: 'prod-1',
        name: 'Tee',
        slug: 'tee',
        description: 'A tee',
        status: 'ACTIVE' as const,
        options: [
          {
            id: 'opt-size',
            code: 'size',
            name: 'Size',
            sortOrder: 0,
            values: [
              {
                id: 'ov-s',
                valueCode: 'S',
                displayName: 'Small',
                sortOrder: 0,
                metadata: null,
              },
              {
                id: 'ov-xl',
                valueCode: 'XL',
                displayName: 'XL',
                sortOrder: 1,
                metadata: null,
              },
            ],
          },
        ],
        variants: [
          {
            id: 'var-s',
            isAvailable: true,
            inventory: {
              trackInventory: true,
              stockOnHand: 5,
              reserved: 0,
            },
            optionValues: [
              {
                optionId: 'opt-size',
                optionValueId: 'ov-s',
                option: { id: 'opt-size', code: 'size', sortOrder: 0 },
                optionValue: {
                  id: 'ov-s',
                  valueCode: 'S',
                  displayName: 'Small',
                  sortOrder: 0,
                  upcharges: [],
                },
              },
            ],
          },
          {
            id: 'var-xl',
            isAvailable: true,
            inventory: {
              trackInventory: true,
              stockOnHand: 2,
              reserved: 0,
            },
            optionValues: [
              {
                optionId: 'opt-size',
                optionValueId: 'ov-xl',
                option: { id: 'opt-size', code: 'size', sortOrder: 0 },
                optionValue: {
                  id: 'ov-xl',
                  valueCode: 'XL',
                  displayName: 'XL',
                  sortOrder: 1,
                  upcharges: [{ amount: 500 }],
                },
              },
            ],
          },
        ],
      },
      design: {
        id: 'design-1',
        name: 'Crest',
        thumbnailUrl: 'https://cdn.example/crest.png',
        moderationStatus: 'APPROVED' as const,
      },
      prices: [{ amount: 5000, currency: 'NGN' }],
    };

    it('builds offers with base+upcharge minor amounts matching quote pre-discount', async () => {
      const offers = service.buildPublicCampaignOffers([baseSource], 'NGN');
      expect(offers).toHaveLength(1);
      expect(offers[0].baseAmountMinor).toBe(500_000);
      expect(offers[0].variants).toHaveLength(2);
      const xl = offers[0].variants.find((v) => v.id === 'var-xl')!;
      expect(xl.unitAmountMinor).toBe(550_000);
      expect(xl.available).toBe(true);
      expect(JSON.stringify(offers)).not.toMatch(
        /moderationNotes|sku|stockOnHand/i,
      );

      (prisma.campaignProduct.findFirst as jest.Mock).mockResolvedValue({
        id: 'cp-1',
        prices: [{ amount: 5000 }],
      });
      (prisma.productVariant.findUnique as jest.Mock).mockResolvedValue({
        ...mockVariant,
        id: 'var-xl',
        optionValues: [
          {
            option: { name: 'Size', code: 'size' },
            optionValue: {
              displayName: 'XL',
              valueCode: 'XL',
              upcharges: [{ amount: 500 }],
            },
          },
        ],
      });
      (prisma.discountCampaign.findMany as jest.Mock).mockResolvedValue([]);

      const quote = await service.quoteCampaign('user-1', 'camp-1', {
        shippingAddressId: 'addr-1',
        items: [
          {
            variantId: 'var-xl',
            designId: 'design-1',
            quantity: 1,
          },
        ],
      });

      const displayMajor = xl.unitAmountMinor / 100;
      expect(
        quote.items[0].unitBasePrice +
          quote.items[0].pricingBreakdown.optionValueUpcharge,
      ).toBe(displayMajor);
      expect(quote.items[0].unitFinalPrice).toBe(displayMajor);
    });

    it('excludes non-ACTIVE product, unapproved design, unpriced, and fully unavailable offers', () => {
      const inactive = {
        ...baseSource,
        id: 'cp-inactive',
        product: { ...baseSource.product, status: 'DRAFT' as const },
      };
      const unapproved = {
        ...baseSource,
        id: 'cp-unapproved',
        design: {
          id: 'design-1',
          name: 'Crest',
          thumbnailUrl: 'https://cdn.example/crest.png',
          moderationStatus: 'PENDING' as const,
        },
      };
      const unpriced = {
        ...baseSource,
        id: 'cp-unpriced',
        prices: [],
      };
      const unavailable = {
        ...baseSource,
        id: 'cp-oos',
        product: {
          ...baseSource.product,
          variants: baseSource.product.variants.map((v) => ({
            ...v,
            isAvailable: false,
          })),
        },
      };

      const offers = service.buildPublicCampaignOffers(
        [inactive, unapproved, unpriced, unavailable, baseSource],
        'NGN',
      );
      expect(offers.map((o) => o.campaignProductId)).toEqual(['cp-1']);
    });

    it('marks tracked out-of-stock variants unavailable without exposing counts', () => {
      const oos = {
        ...baseSource,
        product: {
          ...baseSource.product,
          variants: [
            {
              ...baseSource.product.variants[0],
              inventory: {
                trackInventory: true,
                stockOnHand: 1,
                reserved: 1,
              },
            },
            baseSource.product.variants[1],
          ],
        },
      };
      const offers = service.buildPublicCampaignOffers([oos], 'NGN');
      expect(offers[0].variants.find((v) => v.id === 'var-s')!.available).toBe(
        false,
      );
      expect(offers[0].variants.find((v) => v.id === 'var-xl')!.available).toBe(
        true,
      );
      expect(JSON.stringify(offers[0])).not.toMatch(/stockOnHand|reserved/);
    });

    it('buildOwnerDraftPreviewOffers allows pending designs and watermarks DRAFT', () => {
      const pending = {
        ...baseSource,
        design: {
          ...baseSource.design,
          moderationStatus: 'PENDING' as const,
        },
      };
      const offers = service.buildOwnerDraftPreviewOffers([pending], 'NGN');
      expect(offers).toHaveLength(1);
      expect(offers[0].purchasable).toBe(false);
      expect(offers[0].previewWatermark).toBe('DRAFT');
      expect(offers[0].design.moderationStatus).toBe('PENDING');
      expect(JSON.stringify(offers[0])).not.toMatch(
        /organizerCost|costBasis|moderationNotes/,
      );
    });

    it('buildOwnerDraftPreviewOffers excludes REJECTED designs', () => {
      const rejected = {
        ...baseSource,
        design: {
          ...baseSource.design,
          moderationStatus: 'REJECTED' as const,
        },
      };
      expect(service.buildOwnerDraftPreviewOffers([rejected], 'NGN')).toEqual(
        [],
      );
    });
  });
});
