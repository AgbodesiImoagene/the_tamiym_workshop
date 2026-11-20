import { Test, TestingModule } from '@nestjs/testing';
import {
  ShippingRateProvider,
  ShippingRuleMatchType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { InternalZoneRateProvider } from './internal-zone-rate-provider.service';
import type { ShippingQuoteRequest } from './shipping.types';

describe('InternalZoneRateProvider', () => {
  let service: InternalZoneRateProvider;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      shippingRate: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InternalZoneRateProvider,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(InternalZoneRateProvider);
    prisma = module.get(PrismaService);
  });

  it('returns a normalized breakdown for the active internal zone rate', async () => {
    (prisma.shippingRate.findFirst as jest.Mock).mockResolvedValue({
      id: 'rate-1',
      flatFee: 2500,
      currency: 'NGN',
      serviceLevel: 'STANDARD',
      priority: 100,
      minDeliveryDays: 2,
      maxDeliveryDays: 4,
    });

    const quote = await service.quote({
      destination: {
        countryCode: 'NG',
        zoneId: 'zone-1',
        zoneName: 'Lagos',
        ruleId: 'rule-1',
        matchType: ShippingRuleMatchType.ADMIN1,
        matchValue: 'LA',
        matchContext: null,
        resolutionMethod: 'RULE_ADMIN1',
        confidence: 'medium',
      },
      currency: 'NGN',
      vatAppliedToShipping: true,
      shipment: {
        totalQuantity: 2,
        totalWeightGrams: 600,
        packageLengthMm: 320,
        packageWidthMm: 240,
        packageHeightMm: 80,
        lineItems: [],
      },
    });

    expect(quote).toMatchObject({
      provider: ShippingRateProvider.INTERNAL,
      rateId: 'rate-1',
      zoneId: 'zone-1',
      appliedFee: 2500,
      serviceLevel: 'STANDARD',
      estimatedDeliveryMinDays: 2,
      estimatedDeliveryMaxDays: 4,
      rateSource: 'ZONE_FLAT_RATE',
    });
  });

  describe('TTW-098: weight and quantity brackets', () => {
    const request = (
      totalQuantity: number,
      totalWeightGrams: number | null,
    ): ShippingQuoteRequest => ({
      destination: {
        countryCode: 'NG',
        zoneId: 'zone-1',
        zoneName: 'Lagos',
        ruleId: 'rule-1',
        matchType: ShippingRuleMatchType.ADMIN1,
        matchValue: 'LA',
        matchContext: null,
        resolutionMethod: 'RULE_ADMIN1',
        confidence: 'medium' as const,
      },
      currency: 'NGN',
      vatAppliedToShipping: false,
      shipment: {
        totalQuantity,
        totalWeightGrams,
        packageLengthMm: null,
        packageWidthMm: null,
        packageHeightMm: null,
        lineItems: [],
      },
    });

    const rate = (
      bracketBasis: 'QUANTITY' | 'WEIGHT_GRAMS' | null,
      brackets: Array<{ minValue: number; fee: number }>,
    ) => ({
      id: 'rate-1',
      flatFee: 2500,
      currency: 'NGN',
      serviceLevel: 'STANDARD',
      priority: 100,
      minDeliveryDays: null,
      maxDeliveryDays: null,
      bracketBasis,
      brackets,
    });

    it('keeps the flat fee when the rate has no bracket basis (existing rates)', async () => {
      (prisma.shippingRate.findFirst as jest.Mock).mockResolvedValue(
        rate(null, []),
      );
      const small = await service.quote(request(1, 300));
      const large = await service.quote(request(100, 30000));
      expect(small?.appliedFee).toBe(2500);
      expect(large?.appliedFee).toBe(2500);
      expect(small?.rateSource).toBe('ZONE_FLAT_RATE');
    });

    it('charges more for 100 items than for 1 item on a quantity rate', async () => {
      (prisma.shippingRate.findFirst as jest.Mock).mockResolvedValue(
        rate('QUANTITY', [
          { minValue: 10, fee: 4000 },
          { minValue: 50, fee: 9000 },
        ]),
      );
      expect((await service.quote(request(1, null)))?.appliedFee).toBe(2500);
      expect((await service.quote(request(100, null)))?.appliedFee).toBe(9000);
    });

    it('applies a bracket from its minimum value (inclusive) and not before', async () => {
      (prisma.shippingRate.findFirst as jest.Mock).mockResolvedValue(
        rate('QUANTITY', [
          { minValue: 10, fee: 4000 },
          { minValue: 50, fee: 9000 },
        ]),
      );
      expect((await service.quote(request(9, null)))?.appliedFee).toBe(2500);
      expect((await service.quote(request(10, null)))?.appliedFee).toBe(4000);
      expect((await service.quote(request(49, null)))?.appliedFee).toBe(4000);
      expect((await service.quote(request(50, null)))?.appliedFee).toBe(9000);
    });

    it('picks the right bracket even when brackets come unsorted', async () => {
      (prisma.shippingRate.findFirst as jest.Mock).mockResolvedValue(
        rate('QUANTITY', [
          { minValue: 50, fee: 9000 },
          { minValue: 10, fee: 4000 },
        ]),
      );
      expect((await service.quote(request(20, null)))?.appliedFee).toBe(4000);
    });

    it('uses the total weight on a weight rate and records the bracket applied', async () => {
      (prisma.shippingRate.findFirst as jest.Mock).mockResolvedValue(
        rate('WEIGHT_GRAMS', [{ minValue: 5000, fee: 6000 }]),
      );
      const light = await service.quote(request(2, 4999));
      const heavy = await service.quote(request(20, 5000));
      expect(light?.appliedFee).toBe(2500);
      expect(light?.rateSource).toBe('ZONE_FLAT_RATE');
      expect(heavy).toMatchObject({
        appliedFee: 6000,
        rateSource: 'ZONE_BRACKET_RATE',
        bracket: {
          basis: 'WEIGHT_GRAMS',
          minValue: 5000,
          measuredValue: 5000,
        },
      });
    });

    it('refuses to quote a weight rate when a product has no weight', async () => {
      (prisma.shippingRate.findFirst as jest.Mock).mockResolvedValue(
        rate('WEIGHT_GRAMS', [{ minValue: 5000, fee: 6000 }]),
      );
      await expect(service.quote(request(2, null))).rejects.toMatchObject({
        response: { code: 'SHIPPING_WEIGHT_UNKNOWN' },
      });
    });

    it('does not need weights on a quantity rate', async () => {
      (prisma.shippingRate.findFirst as jest.Mock).mockResolvedValue(
        rate('QUANTITY', [{ minValue: 5, fee: 3000 }]),
      );
      expect((await service.quote(request(5, null)))?.appliedFee).toBe(3000);
    });
  });
});
