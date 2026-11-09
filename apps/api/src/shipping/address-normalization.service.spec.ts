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

  // TTW-185: an edit must never keep a state code or LGA that it contradicts.
  describe('normalizeForUpdate state changes', () => {
    const savedLagosIkeja = {
      addressLine1: '12 Broad Street',
      city: 'Ikeja',
      state: 'Lagos',
      country: 'Nigeria',
      countryCode: 'NG',
      provider: AddressProvider.MANUAL,
      locality: 'Ikeja',
      administrativeAreaLevel1: 'Lagos',
      administrativeAreaLevel2: 'Ikeja',
      stateCode: 'LA',
      lgaId: 'lga-ikeja',
    };

    it('drops the saved state code and LGA when the edited state is unknown', async () => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.normalizeForUpdate(savedLagosIkeja, {
        state: 'Federal Capital Territory',
      });

      expect(result).toMatchObject({
        state: 'Federal Capital Territory',
        administrativeAreaLevel1: 'Federal Capital Territory',
        administrativeAreaLevel2: null,
        stateCode: null,
        lgaId: null,
      });
      expect(result.normalizationMetadata).toMatchObject({
        resolvedStateCode: null,
        resolvedLgaId: null,
      });
      // The old state code must not be used to look up an LGA either.
      expect(prisma.geoLga.findFirst).not.toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ stateCode: 'LA' }),
        }),
      );
    });

    it('drops the saved state code when an explicit stateCode is unknown', async () => {
      (prisma.geoState.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.normalizeForUpdate(savedLagosIkeja, {
        stateCode: 'ZZ',
      });

      expect(prisma.geoState.findUnique).toHaveBeenCalledWith({
        where: { code: 'ZZ' },
      });
      expect(result).toMatchObject({
        stateCode: null,
        lgaId: null,
        administrativeAreaLevel2: null,
      });
    });

    it('ignores an explicit lgaId when the edited state is unknown', async () => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue({
        id: 'lga-ikeja',
        name: 'Ikeja',
      });

      const result = await service.normalizeForUpdate(savedLagosIkeja, {
        state: 'Federal Capital Territory',
        lgaId: 'lga-ikeja',
      });

      expect(result).toMatchObject({ stateCode: null, lgaId: null });
    });

    it('drops a saved LGA that had no state code when the edit names another unknown state', async () => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.normalizeForUpdate(
        {
          ...savedLagosIkeja,
          state: 'Lagos Stat',
          administrativeAreaLevel1: 'Lagos Stat',
          stateCode: null,
        },
        { state: 'Atlantis' },
      );

      expect(result).toMatchObject({
        stateCode: null,
        lgaId: null,
        administrativeAreaLevel2: null,
      });
    });

    it('clears the saved LGA when the edit moves to another known state without an LGA', async () => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue({
        code: 'OG',
        name: 'Ogun',
      });
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.normalizeForUpdate(savedLagosIkeja, {
        state: 'Ogun',
      });

      expect(result).toMatchObject({
        state: 'Ogun',
        administrativeAreaLevel1: 'Ogun',
        administrativeAreaLevel2: null,
        stateCode: 'OG',
        lgaId: null,
      });
    });

    it('keeps an LGA sent with the new state when it belongs to that state', async () => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue({
        code: 'OG',
        name: 'Ogun',
      });
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue({
        id: 'lga-abeokuta-south',
        name: 'Abeokuta South',
      });

      const result = await service.normalizeForUpdate(savedLagosIkeja, {
        state: 'Ogun',
        administrativeAreaLevel2: 'Abeokuta South',
      });

      expect(prisma.geoLga.findFirst).toHaveBeenCalledWith({
        where: {
          stateCode: 'OG',
          name: { equals: 'Abeokuta South', mode: 'insensitive' },
        },
      });
      expect(result).toMatchObject({
        stateCode: 'OG',
        lgaId: 'lga-abeokuta-south',
        administrativeAreaLevel2: 'Abeokuta South',
      });
    });

    it('keeps the saved state code and LGA when the edit does not touch the state', async () => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue({
        code: 'LA',
        name: 'Lagos',
      });
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue({
        id: 'lga-ikeja',
        name: 'Ikeja',
      });

      const result = await service.normalizeForUpdate(savedLagosIkeja, {
        phone: '+2348012345678',
      });

      expect(result).toMatchObject({
        phone: '+2348012345678',
        stateCode: 'LA',
        lgaId: 'lga-ikeja',
        administrativeAreaLevel2: 'Ikeja',
      });
    });

    it('keeps the saved codes when the checkout resends the same unresolvable state text', async () => {
      // Saved by Google Places: the text does not resolve, the code is valid.
      const savedFromPlaces = {
        ...savedLagosIkeja,
        state: 'Lagos State',
        administrativeAreaLevel1: 'Lagos State',
        provider: AddressProvider.GOOGLE_PLACES,
      };
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.normalizeForUpdate(savedFromPlaces, {
        addressLine1: '12 Broad Street',
        city: 'Ikeja',
        state: ' lagos state ',
        country: 'Nigeria',
      });

      expect(result).toMatchObject({
        stateCode: 'LA',
        lgaId: 'lga-ikeja',
        administrativeAreaLevel2: 'Ikeja',
      });
    });

    it('clears the saved LGA when an explicit stateCode moves to another known state', async () => {
      (prisma.geoState.findUnique as jest.Mock).mockResolvedValue({
        code: 'OG',
        name: 'Ogun',
      });
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.normalizeForUpdate(savedLagosIkeja, {
        stateCode: 'OG',
      });

      expect(prisma.geoLga.findFirst).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        stateCode: 'OG',
        lgaId: null,
        administrativeAreaLevel2: null,
      });
    });

    it('keeps the saved LGA when a different text resolves to the same state', async () => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue({
        code: 'LA',
        name: 'Lagos',
      });
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue({
        id: 'lga-ikeja',
        name: 'Ikeja',
      });

      const result = await service.normalizeForUpdate(savedLagosIkeja, {
        state: 'LA',
      });

      expect(prisma.geoLga.findFirst).toHaveBeenCalledWith({
        where: {
          stateCode: 'LA',
          name: { equals: 'Ikeja', mode: 'insensitive' },
        },
      });
      expect(result).toMatchObject({ stateCode: 'LA', lgaId: 'lga-ikeja' });
    });

    it('refuses an old-state lgaId sent with a new known state', async () => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue({
        code: 'OG',
        name: 'Ogun',
      });
      // Behaves like the database: Ikeja only exists under LA.
      (prisma.geoLga.findFirst as jest.Mock).mockImplementation(
        ({ where }: { where: { id?: string; stateCode?: string } }) =>
          Promise.resolve(
            where.id === 'lga-ikeja' && where.stateCode === 'LA'
              ? { id: 'lga-ikeja', name: 'Ikeja' }
              : null,
          ),
      );

      const result = await service.normalizeForUpdate(savedLagosIkeja, {
        state: 'Ogun',
        lgaId: 'lga-ikeja',
      });

      expect(prisma.geoLga.findFirst).toHaveBeenCalledWith({
        where: { id: 'lga-ikeja', stateCode: 'OG' },
      });
      expect(result).toMatchObject({
        stateCode: 'OG',
        lgaId: null,
        administrativeAreaLevel2: null,
      });
    });

    it('keeps the saved codes when the same explicit stateCode is resent', async () => {
      (prisma.geoState.findUnique as jest.Mock).mockResolvedValue({
        code: 'LA',
        name: 'Lagos',
      });
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue({
        id: 'lga-ikeja',
        name: 'Ikeja',
      });

      const result = await service.normalizeForUpdate(savedLagosIkeja, {
        stateCode: 'la',
      });

      expect(result).toMatchObject({ stateCode: 'LA', lgaId: 'lga-ikeja' });
    });
  });
});
