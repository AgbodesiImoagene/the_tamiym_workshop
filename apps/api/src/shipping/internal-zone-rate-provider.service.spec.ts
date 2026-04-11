import { Test, TestingModule } from '@nestjs/testing';
import {
  ShippingRateProvider,
  ShippingRuleMatchType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { InternalZoneRateProvider } from './internal-zone-rate-provider.service';

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
});
