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

    // TTW-087 replaces the TTW-185 tests that expected an unknown state to be
    // saved with its codes dropped: the edit is now refused outright.
    const expectUnknownState = (promise: Promise<unknown>) =>
      expect(promise).rejects.toMatchObject({
        response: expect.objectContaining({
          statusCode: 400,
          code: 'ADDRESS_STATE_UNKNOWN',
        }),
      });

    it('refuses an edit to an unknown state instead of keeping the saved state code and LGA', async () => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(null);

      await expectUnknownState(
        service.normalizeForUpdate(savedLagosIkeja, {
          state: 'Federal Capital Territory',
        }),
      );
    });

    it('refuses an edit whose explicit stateCode is unknown', async () => {
      (prisma.geoState.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(null);

      await expectUnknownState(
        service.normalizeForUpdate(savedLagosIkeja, { stateCode: 'ZZ' }),
      );
      expect(prisma.geoState.findUnique).toHaveBeenCalledWith({
        where: { code: 'ZZ' },
      });
    });

    it('refuses an explicit lgaId sent with an unknown state', async () => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue({
        id: 'lga-ikeja',
        name: 'Ikeja',
      });

      await expectUnknownState(
        service.normalizeForUpdate(savedLagosIkeja, {
          state: 'Federal Capital Territory',
          lgaId: 'lga-ikeja',
        }),
      );
    });

    it('refuses a saved LGA with no state code when the edit names another unknown state', async () => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(null);

      await expectUnknownState(
        service.normalizeForUpdate(
          {
            ...savedLagosIkeja,
            state: 'Lagos Stat',
            administrativeAreaLevel1: 'Lagos Stat',
            stateCode: null,
          },
          { state: 'Atlantis' },
        ),
      );
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

  // TTW-186: an address never carries an LGA that its state does not contain.
  describe('LGA consistency with the state (TTW-186)', () => {
    const saved = {
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
    // Saved before TTW-087: a state we do not know, so no state code.
    const savedLegacyUnknown = {
      ...saved,
      state: 'Atlantis',
      administrativeAreaLevel1: 'Atlantis',
      administrativeAreaLevel2: null,
      stateCode: null,
      lgaId: null,
    };

    type LgaWhere = {
      id?: string;
      stateCode?: string;
      name?: { equals: string };
    };
    // Behaves like the database: LGA rows by (state, name) and by id.
    const rows = [
      { id: 'lga-ikeja', name: 'Ikeja', stateCode: 'LA' },
      { id: 'lga-surulere', name: 'Surulere', stateCode: 'LA' },
    ];

    beforeEach(() => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue({
        code: 'LA',
        name: 'Lagos',
      });
      (prisma.geoState.findUnique as jest.Mock).mockResolvedValue({
        code: 'LA',
        name: 'Lagos',
      });
      (prisma.geoLga.findFirst as jest.Mock).mockImplementation(
        ({ where }: { where: LgaWhere }) =>
          Promise.resolve(
            rows.find(
              (row) =>
                (where.id === undefined || row.id === where.id) &&
                (where.stateCode === undefined ||
                  row.stateCode === where.stateCode) &&
                (where.name === undefined ||
                  row.name.toLowerCase() === where.name.equals.toLowerCase()),
            ) ?? null,
          ),
      );
    });

    it('ignores an explicit lgaId when the saved state is unknown', async () => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.normalizeForUpdate(savedLegacyUnknown, {
        lgaId: 'lga-ikeja',
      });

      expect(result).toMatchObject({ stateCode: null, lgaId: null });
    });

    it('clears the saved LGA when an LGA-only edit names an unknown LGA', async () => {
      const result = await service.normalizeForUpdate(saved, {
        administrativeAreaLevel2: 'Surelere',
      });

      expect(result).toMatchObject({
        stateCode: 'LA',
        lgaId: null,
        administrativeAreaLevel2: 'Surelere',
      });
    });

    it('keeps the saved LGA when the same LGA text is resent', async () => {
      const result = await service.normalizeForUpdate(saved, {
        administrativeAreaLevel2: ' ikeja ',
      });

      expect(result).toMatchObject({
        stateCode: 'LA',
        lgaId: 'lga-ikeja',
        administrativeAreaLevel2: 'Ikeja',
      });
    });

    it('moves to the new LGA when an LGA-only edit names another LGA of the state', async () => {
      const result = await service.normalizeForUpdate(saved, {
        administrativeAreaLevel2: 'Surulere',
      });

      expect(result).toMatchObject({
        stateCode: 'LA',
        lgaId: 'lga-surulere',
        administrativeAreaLevel2: 'Surulere',
      });
    });

    it('clears the saved LGA when an explicit lgaId belongs to another state', async () => {
      rows.push({ id: 'lga-abeokuta', name: 'Abeokuta', stateCode: 'OG' });
      try {
        const result = await service.normalizeForUpdate(saved, {
          lgaId: 'lga-abeokuta',
        });

        expect(result).toMatchObject({ stateCode: 'LA', lgaId: null });
      } finally {
        rows.pop();
      }
    });

    it('keeps the saved LGA when the same lgaId is resent', async () => {
      const result = await service.normalizeForUpdate(saved, {
        lgaId: 'lga-ikeja',
      });

      expect(result).toMatchObject({ stateCode: 'LA', lgaId: 'lga-ikeja' });
    });

    it('keeps the saved LGA when the edit does not touch the LGA', async () => {
      const result = await service.normalizeForUpdate(saved, {
        phone: '+2348012345678',
      });

      expect(result).toMatchObject({ stateCode: 'LA', lgaId: 'lga-ikeja' });
    });
  });

  // TTW-087: a Nigerian address must carry a state the platform knows.
  describe('unknown Nigerian state (TTW-087)', () => {
    const savedUnknown = {
      addressLine1: '1 Old Road',
      city: 'Somewhere',
      state: 'Atlantis',
      country: 'Nigeria',
      countryCode: 'NG',
      provider: AddressProvider.MANUAL,
      administrativeAreaLevel1: 'Atlantis',
      stateCode: null,
      lgaId: null,
    };

    beforeEach(() => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue(null);
      (prisma.geoState.findUnique as jest.Mock).mockResolvedValue(null);
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(null);
    });

    it('refuses a typed state that matches no known state on create', async () => {
      await expect(
        service.normalizeForCreate({
          addressLine1: '12 Broad Street',
          city: 'Lagos',
          state: 'Lagoss',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({
          statusCode: 400,
          code: 'ADDRESS_STATE_UNKNOWN',
        }),
      });
    });

    it('refuses an unknown explicit stateCode on create', async () => {
      await expect(
        service.normalizeForCreate({
          addressLine1: '12 Broad Street',
          city: 'Lagos',
          state: 'Lagos',
          stateCode: 'ZZ',
        }),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ADDRESS_STATE_UNKNOWN' }),
      });
    });

    it('refuses an edit that changes the state to an unknown one', async () => {
      await expect(
        service.normalizeForUpdate(
          {
            ...savedUnknown,
            state: 'Lagos',
            administrativeAreaLevel1: 'Lagos',
            stateCode: 'LA',
          },
          { state: 'Atlantis' },
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ADDRESS_STATE_UNKNOWN' }),
      });
    });

    it('lets an edit that leaves an already-saved unknown state untouched go through', async () => {
      const result = await service.normalizeForUpdate(savedUnknown, {
        phone: '08012345678',
        state: 'Atlantis',
      });
      expect(result).toMatchObject({ state: 'Atlantis', stateCode: null });
    });

    it('refuses an edit that moves a non-Nigerian address to Nigeria without a known state', async () => {
      await expect(
        service.normalizeForUpdate(
          {
            addressLine1: '1 Main St',
            city: 'Accra',
            state: 'Greater Accra',
            country: 'Ghana',
            countryCode: 'GH',
            provider: AddressProvider.MANUAL,
          },
          { country: 'Nigeria', countryCode: 'NG' },
        ),
      ).rejects.toMatchObject({
        response: expect.objectContaining({ code: 'ADDRESS_STATE_UNKNOWN' }),
      });
    });

    it('does not refuse a state outside Nigeria', async () => {
      await expect(
        service.normalizeForCreate({
          addressLine1: '1 Main St',
          city: 'Accra',
          state: 'Greater Accra',
          countryCode: 'GH',
          country: 'Ghana',
        }),
      ).resolves.toMatchObject({ countryCode: 'GH' });
    });
  });
});
