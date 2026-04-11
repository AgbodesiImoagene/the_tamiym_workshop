import { Test, TestingModule } from '@nestjs/testing';
import { AddressNormalizationService } from './address-normalization.service';
import { PrismaService } from '../prisma/prisma.service';
import { AddressProvider } from '../generated/prisma/enums';

describe('AddressNormalizationService', () => {
  let service: AddressNormalizationService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      geoState: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
      },
      geoLga: {
        findFirst: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AddressNormalizationService,
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get(AddressNormalizationService);
    prisma = module.get(PrismaService);
  });

  it('normalizes Nigeria admin levels into stateCode and lgaId', async () => {
    (prisma.geoState.findFirst as jest.Mock).mockResolvedValue({
      code: 'LA',
      name: 'Lagos',
    });
    (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue({
      id: 'lga-ikeja',
      name: 'Ikeja',
    });

    const result = await service.normalizeForCreate({
      addressLine1: '12 Broad Street',
      city: 'Lagos',
      state: 'Lagos',
      administrativeAreaLevel2: 'Ikeja',
      googlePlaceId: 'place-1',
    });

    expect(result).toMatchObject({
      country: 'Nigeria',
      countryCode: 'NG',
      city: 'Lagos',
      state: 'Lagos',
      locality: 'Lagos',
      administrativeAreaLevel1: 'Lagos',
      administrativeAreaLevel2: 'Ikeja',
      stateCode: 'LA',
      lgaId: 'lga-ikeja',
      provider: AddressProvider.GOOGLE_PLACES,
      googlePlaceId: 'place-1',
    });
  });

  it('keeps non-Nigeria addresses generic without geo lookups', async () => {
    const result = await service.normalizeForCreate({
      addressLine1: '1600 Amphitheatre Parkway',
      city: 'Mountain View',
      state: 'California',
      country: 'United States',
      countryCode: 'US',
      administrativeAreaLevel2: 'Santa Clara County',
    });

    expect(result).toMatchObject({
      country: 'United States',
      countryCode: 'US',
      city: 'Mountain View',
      state: 'California',
      administrativeAreaLevel1: 'California',
      administrativeAreaLevel2: 'Santa Clara County',
      stateCode: null,
      lgaId: null,
      provider: AddressProvider.MANUAL,
    });
    expect(prisma.geoState.findFirst).not.toHaveBeenCalled();
  });
});
