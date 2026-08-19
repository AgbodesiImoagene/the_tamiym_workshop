import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingRuleMatchType } from '../generated/prisma/enums';
import { ShippingDestinationResolver } from './shipping-destination-resolver.service';

describe('ShippingDestinationResolver', () => {
  let service: ShippingDestinationResolver;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      shippingZoneRule: {
        findMany: jest.fn(),
      },
      shippingZoneArea: {
        findFirst: jest.fn(),
      },
      geoLga: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ShippingDestinationResolver,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(ShippingDestinationResolver);
    prisma = module.get(PrismaService);
  });

  it('prefers a more specific ADMIN2 rule over ADMIN1', async () => {
    (prisma.shippingZoneRule.findMany as jest.Mock).mockResolvedValue([
      {
        id: 'rule-lga',
        matchType: ShippingRuleMatchType.ADMIN2,
        matchValue: 'lga-1',
        matchContext: 'LA',
        priority: 100,
        zone: { id: 'zone-lga', name: 'Ikeja' },
      },
      {
        id: 'rule-state',
        matchType: ShippingRuleMatchType.ADMIN1,
        matchValue: 'LA',
        matchContext: null,
        priority: 200,
        zone: { id: 'zone-state', name: 'Lagos' },
      },
    ]);

    const destination = await service.resolveAddress({
      id: 'addr-1',
      addressLine1: '12 Broad Street',
      addressLine2: null,
      city: 'Lagos',
      state: 'Lagos',
      postalCode: null,
      country: 'Nigeria',
      countryCode: 'NG',
      locality: 'Lagos',
      dependentLocality: null,
      administrativeAreaLevel1: 'Lagos',
      administrativeAreaLevel2: 'Ikeja',
      stateCode: 'LA',
      lgaId: 'lga-1',
    });

    expect(destination).toMatchObject({
      zoneId: 'zone-lga',
      ruleId: 'rule-lga',
      matchType: ShippingRuleMatchType.ADMIN2,
      resolutionMethod: 'RULE_ADMIN2',
    });
  });

  it('falls back to the legacy Nigeria area mapping when no generic rule matches', async () => {
    (prisma.shippingZoneRule.findMany as jest.Mock).mockResolvedValue([]);
    (prisma.shippingZoneArea.findFirst as jest.Mock).mockResolvedValue({
      id: 'area-1',
      zone: { id: 'zone-legacy', name: 'Lagos' },
      stateCode: 'LA',
      lgaId: null,
    });

    const destination = await service.resolveAddress({
      id: 'addr-1',
      addressLine1: '12 Broad Street',
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
      lgaId: null,
    });

    expect(destination).toMatchObject({
      zoneId: 'zone-legacy',
      matchType: ShippingRuleMatchType.ADMIN1,
      resolutionMethod: 'LEGACY_NIGERIA_AREA',
    });
  });
});
