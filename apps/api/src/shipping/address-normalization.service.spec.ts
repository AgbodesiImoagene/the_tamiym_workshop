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
        // TTW-221: by default the state has no active LGA, so the "LGA
        // required" rule stays dormant for the older tests below.
        count: jest.fn().mockResolvedValue(0),
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

  describe('TTW-219: country code', () => {
    const input = {
      addressLine1: '12 Broad Street',
      city: 'Lagos',
      state: 'Nowhereland',
    };

    it.each(['\uFF2E\uFF27', 'ng', 'Ng'])(
      'reads %j as NG, so an unknown state is still refused',
      async (countryCode) => {
        (prisma.geoState.findFirst as jest.Mock).mockResolvedValue(null);
        (prisma.geoState.findUnique as jest.Mock).mockResolvedValue(null);
        await expect(
          service.normalizeForCreate({ ...input, countryCode }),
        ).rejects.toMatchObject({
          response: { code: 'ADDRESS_STATE_UNKNOWN' },
        });
      },
    );

    it.each(['XX', 'N1', 'NGA', '\u0131t'])(
      'refuses %j with ADDRESS_COUNTRY_CODE_INVALID on create and update',
      async (countryCode) => {
        await expect(
          service.normalizeForCreate({ ...input, countryCode }),
        ).rejects.toMatchObject({
          response: { code: 'ADDRESS_COUNTRY_CODE_INVALID' },
        });
        await expect(
          service.normalizeForUpdate(
            { countryCode: 'NG', country: 'Nigeria' } as never,
            { countryCode },
          ),
        ).rejects.toMatchObject({
          response: { code: 'ADDRESS_COUNTRY_CODE_INVALID' },
        });
      },
    );

    it('keeps a valid non-Nigerian code working', async () => {
      await expect(
        service.normalizeForCreate({ ...input, countryCode: 'gh' }),
      ).resolves.toMatchObject({ countryCode: 'GH' });
    });
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

  describe('TTW-221: an LGA is required in a state that has active LGAs', () => {
    const lagos = { code: 'LA', name: 'Lagos', isActive: true };
    const ikeja = { id: 'lga-ikeja', name: 'Ikeja', isActive: true };
    const saved = {
      addressLine1: '1 Test Street',
      city: 'Ikeja',
      state: 'Lagos',
      country: 'Nigeria',
      countryCode: 'NG',
      provider: AddressProvider.MANUAL,
      administrativeAreaLevel1: 'Lagos',
      administrativeAreaLevel2: 'Ikeja',
      stateCode: 'LA',
      lgaId: 'lga-ikeja',
    };
    const savedNoLga = {
      ...saved,
      administrativeAreaLevel2: null,
      lgaId: null,
    };
    const base = { addressLine1: '1 Test Street', city: 'Lagos' };
    const refused = { response: { code: 'ADDRESS_LGA_REQUIRED' } };

    beforeEach(() => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue(lagos);
      (prisma.geoState.findUnique as jest.Mock).mockResolvedValue(lagos);
      (prisma.geoLga.count as jest.Mock).mockResolvedValue(3);
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(null);
    });

    it('refuses a new address with no LGA', async () => {
      await expect(
        service.normalizeForCreate({ ...base, state: 'Lagos' }),
      ).rejects.toMatchObject(refused);
      expect(prisma.geoLga.count).toHaveBeenCalledWith({
        where: { stateCode: 'LA', isActive: true },
      });
    });

    it('refuses a new address whose LGA text names no active LGA', async () => {
      await expect(
        service.normalizeForCreate({
          ...base,
          state: 'Lagos',
          administrativeAreaLevel2: 'Nowhere',
        }),
      ).rejects.toMatchObject(refused);
    });

    it('accepts a new address with an LGA', async () => {
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(ikeja);
      const result = await service.normalizeForCreate({
        ...base,
        state: 'Lagos',
        administrativeAreaLevel2: 'Ikeja',
      });
      expect(result.lgaId).toBe('lga-ikeja');
    });

    it('accepts a new address in a state that has no active LGA', async () => {
      (prisma.geoLga.count as jest.Mock).mockResolvedValue(0);
      const result = await service.normalizeForCreate({
        ...base,
        state: 'Lagos',
      });
      expect(result.lgaId).toBeNull();
    });

    it('does not ask a non-Nigerian address for an LGA', async () => {
      const result = await service.normalizeForCreate({
        ...base,
        state: 'Accra',
        countryCode: 'GH',
      });
      expect(result.lgaId).toBeNull();
      expect(prisma.geoLga.count).not.toHaveBeenCalled();
    });

    it('refuses to clear the saved LGA', async () => {
      await expect(
        service.normalizeForUpdate(saved, { lgaId: null }),
      ).rejects.toMatchObject(refused);
    });

    it('refuses an edit that replaces the LGA with one that does not resolve', async () => {
      await expect(
        service.normalizeForUpdate(saved, {
          administrativeAreaLevel2: 'Nowhere',
        }),
      ).rejects.toMatchObject(refused);
    });

    it('refuses an edit that moves to another state without an LGA', async () => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue({
        code: 'OG',
        name: 'Ogun',
        isActive: true,
      });
      await expect(
        service.normalizeForUpdate(saved, { state: 'Ogun' }),
      ).rejects.toMatchObject(refused);
    });

    it('refuses an edit that moves a non-Nigerian address to Nigeria without an LGA', async () => {
      await expect(
        service.normalizeForUpdate(
          {
            ...saved,
            country: 'Ghana',
            countryCode: 'GH',
            stateCode: null,
            lgaId: null,
          },
          { countryCode: 'NG', state: 'Lagos' },
        ),
      ).rejects.toMatchObject(refused);
    });

    it('lets a saved address with no LGA be edited on other fields', async () => {
      const result = await service.normalizeForUpdate(savedNoLga, {
        phone: '+2348012345678',
      });
      expect(result).toMatchObject({ stateCode: 'LA', lgaId: null });
    });

    it('lets a saved address with no LGA resend its state and an empty clear', async () => {
      const result = await service.normalizeForUpdate(savedNoLga, {
        state: 'Lagos',
        lgaId: null,
      });
      expect(result).toMatchObject({ stateCode: 'LA', lgaId: null });
    });

    it('lets a saved address with no LGA gain one', async () => {
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(ikeja);
      const result = await service.normalizeForUpdate(savedNoLga, {
        administrativeAreaLevel2: 'Ikeja',
      });
      expect(result.lgaId).toBe('lga-ikeja');
    });

    it('keeps the saved LGA on an unrelated edit', async () => {
      const result = await service.normalizeForUpdate(saved, {
        phone: '+2348012345678',
      });
      expect(result.lgaId).toBe('lga-ikeja');
    });
  });

  describe('TTW-221: spaces in LGA and state names', () => {
    const lagos = { code: 'LA', name: 'Lagos', isActive: true };

    beforeEach(() => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue(lagos);
    });

    it.each([
      ['double space', 'Ikeja  Mainland'],
      ['tab', 'Ikeja\tMainland'],
      ['non-breaking space', 'Ikeja\u00a0Mainland'],
      ['surrounding and mixed spaces', '  Ikeja \u00a0\t Mainland  '],
    ])(
      'looks the LGA up with single spaces (%s) and stores its canonical name',
      async (_label, typed) => {
        (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue({
          id: 'lga-ikeja-mainland',
          name: 'Ikeja Mainland',
          isActive: true,
        });

        const result = await service.normalizeForCreate({
          addressLine1: '1 Test Street',
          city: 'Lagos',
          state: 'Lagos',
          administrativeAreaLevel2: typed,
        });

        expect(prisma.geoLga.findFirst).toHaveBeenCalledWith({
          where: {
            stateCode: 'LA',
            name: { equals: 'Ikeja Mainland', mode: 'insensitive' },
          },
        });
        expect(result.lgaId).toBe('lga-ikeja-mainland');
        expect(result.administrativeAreaLevel2).toBe('Ikeja Mainland');
      },
    );

    it('stores the single-spaced text when no LGA matches', async () => {
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.normalizeForCreate({
        addressLine1: '1 Test Street',
        city: 'Lagos',
        state: 'Lagos',
        administrativeAreaLevel2: 'Nowhere \t Town',
      });

      expect(result.lgaId).toBeNull();
      expect(result.administrativeAreaLevel2).toBe('Nowhere Town');
    });

    it('looks a state typed with extra spaces up by its single-spaced name', async () => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue({
        code: 'AK',
        name: 'Akwa Ibom',
        isActive: true,
      });

      const result = await service.normalizeForCreate({
        addressLine1: '1 Test Street',
        city: 'Uyo',
        state: 'Akwa  Ibom',
      });

      expect(prisma.geoState.findFirst).toHaveBeenCalledWith({
        where: {
          isActive: true,
          OR: [
            { code: 'AKWA IBOM' },
            { name: { equals: 'Akwa Ibom', mode: 'insensitive' } },
          ],
        },
      });
      expect(result.stateCode).toBe('AK');
    });

    const savedAkwaIbom = {
      addressLine1: '1 Test Street',
      city: 'Uyo',
      state: 'Akwa Ibom',
      country: 'Nigeria',
      countryCode: 'NG',
      provider: AddressProvider.MANUAL,
      administrativeAreaLevel1: 'Akwa Ibom',
      administrativeAreaLevel2: 'Uyo',
      stateCode: 'AK',
      lgaId: 'lga-uyo',
    };

    it('does not see a re-spaced LGA text as a change of LGA', async () => {
      (prisma.geoState.findUnique as jest.Mock).mockResolvedValue({
        code: 'AK',
        name: 'Akwa Ibom',
        isActive: true,
      });
      // The lookup finds nothing: only "not a change" keeps the saved id.
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.normalizeForUpdate(savedAkwaIbom, {
        administrativeAreaLevel2: 'U yo'.replace(' ', ''),
      });
      expect(result.lgaId).toBe('lga-uyo');

      const respaced = await service.normalizeForUpdate(
        { ...savedAkwaIbom, administrativeAreaLevel2: 'Uyo South' },
        { administrativeAreaLevel2: 'Uyo \u00a0 South' },
      );
      expect(respaced.lgaId).toBe('lga-uyo');
    });

    it('does not see a re-spaced state text as a change of state', async () => {
      // The saved state is no longer offered: a real state change would be
      // refused as unknown, a re-spaced resend must not be.
      (prisma.geoState.findUnique as jest.Mock).mockResolvedValue({
        code: 'AK',
        name: 'Akwa Ibom',
        isActive: false,
      });
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.normalizeForUpdate(savedAkwaIbom, {
        state: 'Akwa  Ibom',
      });

      expect(result.stateCode).toBe('AK');
      expect(result.lgaId).toBe('lga-uyo');
    });

    it('keeps a non-Nigerian state text single-spaced in both columns', async () => {
      const result = await service.normalizeForCreate({
        addressLine1: '1 Main Street',
        city: 'New York',
        state: 'New  York',
        countryCode: 'US',
      });

      expect(result.state).toBe('New York');
      expect(result.administrativeAreaLevel1).toBe('New York');
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

    it('drops a saved LGA from a legacy address with no state code on an unrelated edit', async () => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue(null);

      const result = await service.normalizeForUpdate(
        { ...savedLegacyUnknown, lgaId: 'lga-ikeja' },
        { phone: '+2348012345678' },
      );

      expect(result).toMatchObject({ stateCode: null, lgaId: null });
    });

    it('drops a saved LGA that was never checked against a state the text now resolves to', async () => {
      const result = await service.normalizeForUpdate(
        {
          ...savedLegacyUnknown,
          state: 'Lagos',
          administrativeAreaLevel1: 'Lagos',
          lgaId: 'lga-ikeja',
        },
        { phone: '+2348012345678' },
      );

      expect(result).toMatchObject({ stateCode: 'LA', lgaId: null });
    });

    it('lets the explicit lgaId win over a different LGA text', async () => {
      const result = await service.normalizeForUpdate(saved, {
        lgaId: 'lga-surulere',
        administrativeAreaLevel2: 'Ikeja',
      });

      expect(result).toMatchObject({
        lgaId: 'lga-surulere',
        administrativeAreaLevel2: 'Surulere',
      });
    });

    it('treats a whitespace-only lgaId as not sent and keeps the saved LGA', async () => {
      const result = await service.normalizeForUpdate(saved, { lgaId: '  ' });

      expect(result).toMatchObject({ stateCode: 'LA', lgaId: 'lga-ikeja' });
    });

    it('never stores an lgaId on a non-Nigerian address', async () => {
      const result = await service.normalizeForUpdate(
        {
          ...saved,
          country: 'Ghana',
          countryCode: 'GH',
          stateCode: null,
          lgaId: null,
          administrativeAreaLevel2: null,
        },
        { lgaId: 'lga-ikeja' },
      );

      expect(result).toMatchObject({ lgaId: null });
    });

    it('moves a saved LGA with no LGA text to the one the text resolves to', async () => {
      const result = await service.normalizeForUpdate(
        { ...saved, administrativeAreaLevel2: null },
        { administrativeAreaLevel2: 'Ikeja' },
      );

      expect(result).toMatchObject({ lgaId: 'lga-ikeja' });
    });

    it('keeps the saved LGA when the edit does not touch the LGA', async () => {
      const result = await service.normalizeForUpdate(saved, {
        phone: '+2348012345678',
      });

      expect(result).toMatchObject({ stateCode: 'LA', lgaId: 'lga-ikeja' });
    });

    // TTW-193: an explicit null is the only way to remove a saved LGA.
    describe('explicit clear (TTW-193)', () => {
      it('clears the LGA id and the LGA text when lgaId is null', async () => {
        const result = await service.normalizeForUpdate(saved, {
          lgaId: null,
        });

        expect(result).toMatchObject({
          lgaId: null,
          administrativeAreaLevel2: null,
        });
      });

      it('never touches the state or the state code on a clear', async () => {
        const result = await service.normalizeForUpdate(saved, {
          state: 'Lagos',
          stateCode: 'LA',
          lgaId: null,
        });

        expect(result).toMatchObject({
          state: 'Lagos',
          administrativeAreaLevel1: 'Lagos',
          stateCode: 'LA',
          lgaId: null,
          administrativeAreaLevel2: null,
        });
      });

      it('still keeps the saved LGA when lgaId is absent', async () => {
        const result = await service.normalizeForUpdate(saved, {
          state: 'Lagos',
          stateCode: 'LA',
        });

        expect(result).toMatchObject({
          lgaId: 'lga-ikeja',
          administrativeAreaLevel2: 'Ikeja',
        });
      });

      it('lets a named LGA text decide when lgaId is null', async () => {
        const result = await service.normalizeForUpdate(saved, {
          lgaId: null,
          administrativeAreaLevel2: 'Surulere',
        });

        expect(result).toMatchObject({
          lgaId: 'lga-surulere',
          administrativeAreaLevel2: 'Surulere',
        });
      });

      it('treats an empty LGA text next to a null lgaId as a clear', async () => {
        const result = await service.normalizeForUpdate(saved, {
          lgaId: null,
          administrativeAreaLevel2: '  ',
        });

        expect(result).toMatchObject({
          lgaId: null,
          administrativeAreaLevel2: null,
        });
      });

      it('has no effect on create', async () => {
        const result = await service.normalizeForCreate({
          addressLine1: '12 Broad Street',
          city: 'Ikeja',
          state: 'Lagos',
          lgaId: null,
        });

        expect(result).toMatchObject({ stateCode: 'LA', lgaId: null });
      });
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

  describe('deactivated Nigerian state (TTW-194)', () => {
    type Row = { code: string; name: string; isActive: boolean };
    const rows: Row[] = [
      { code: 'LA', name: 'Lagos', isActive: true },
      { code: 'AB', name: 'Abia', isActive: false },
    ];
    type Where = {
      code?: string;
      isActive?: boolean;
      OR?: Array<{ code?: string; name?: { equals: string } }>;
    };
    // Fake table that honours the filters the service sends, so the tests
    // check behaviour (what is returned) and not the exact query shape.
    const match = (where: Where) =>
      rows.find(
        (r) =>
          (where.code === undefined || r.code === where.code) &&
          (where.isActive === undefined || r.isActive === where.isActive) &&
          (where.OR === undefined ||
            where.OR.some(
              (c) =>
                (c.code !== undefined && r.code === c.code) ||
                (c.name !== undefined &&
                  r.name.toLowerCase() === c.name.equals.toLowerCase()),
            )),
      ) ?? null;

    const savedAbia = {
      addressLine1: '1 Old Road',
      city: 'Umuahia',
      state: 'Abia',
      country: 'Nigeria',
      countryCode: 'NG',
      provider: AddressProvider.MANUAL,
      administrativeAreaLevel1: 'Abia',
      stateCode: 'AB',
      lgaId: null,
    };

    const expectUnknown = (promise: Promise<unknown>) =>
      expect(promise).rejects.toMatchObject({
        response: expect.objectContaining({
          statusCode: 400,
          code: 'ADDRESS_STATE_UNKNOWN',
        }),
      });

    beforeEach(() => {
      (prisma.geoState.findFirst as jest.Mock).mockImplementation(
        ({ where }: { where: Where }) => Promise.resolve(match(where)),
      );
      (prisma.geoState.findUnique as jest.Mock).mockImplementation(
        ({ where }: { where: Where }) => Promise.resolve(match(where)),
      );
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(null);
    });

    it('refuses a deactivated state named by text on create', async () => {
      await expectUnknown(
        service.normalizeForCreate({
          addressLine1: '1 Main St',
          city: 'Umuahia',
          state: 'Abia',
        }),
      );
    });

    it('refuses a deactivated state named by code on create', async () => {
      await expectUnknown(
        service.normalizeForCreate({
          addressLine1: '1 Main St',
          city: 'Umuahia',
          state: 'Abia',
          stateCode: 'AB',
        }),
      );
    });

    it('still accepts an active state on create', async () => {
      await expect(
        service.normalizeForCreate({
          addressLine1: '1 Main St',
          city: 'Ikeja',
          state: 'Lagos',
        }),
      ).resolves.toMatchObject({ stateCode: 'LA' });
    });

    it('refuses an edit that moves a saved address to a deactivated state', async () => {
      await expectUnknown(
        service.normalizeForUpdate(
          {
            ...savedAbia,
            state: 'Lagos',
            administrativeAreaLevel1: 'Lagos',
            stateCode: 'LA',
          },
          { state: 'Abia' },
        ),
      );
      await expectUnknown(
        service.normalizeForUpdate(
          {
            ...savedAbia,
            state: 'Lagos',
            administrativeAreaLevel1: 'Lagos',
            stateCode: 'LA',
          },
          { stateCode: 'AB' },
        ),
      );
    });

    it('lets an edit of another field keep a saved state deactivated later', async () => {
      const result = await service.normalizeForUpdate(savedAbia, {
        phone: '+2348012345678',
      });
      expect(result).toMatchObject({ state: 'Abia', stateCode: 'AB' });
    });

    it('lets the checkout resend the same deactivated state text or code', async () => {
      await expect(
        service.normalizeForUpdate(savedAbia, {
          state: 'Abia',
          phone: '+2348012345678',
        }),
      ).resolves.toMatchObject({ stateCode: 'AB' });
      await expect(
        service.normalizeForUpdate(savedAbia, { stateCode: 'AB' }),
      ).resolves.toMatchObject({ stateCode: 'AB' });
    });
  });

  describe('deactivated Nigerian LGA (TTW-202)', () => {
    const OFF_LGA = {
      id: 'lga-off',
      name: 'Ikeja',
      stateCode: 'LA',
      isActive: false,
    };
    const ON_LGA = {
      ...OFF_LGA,
      id: 'lga-on',
      name: 'Surulere',
      isActive: true,
    };
    const savedWithOffLga = {
      addressLine1: '1 Old Road',
      city: 'Ikeja',
      state: 'Lagos',
      country: 'Nigeria',
      countryCode: 'NG',
      provider: AddressProvider.MANUAL,
      administrativeAreaLevel1: 'Lagos',
      administrativeAreaLevel2: 'Ikeja',
      stateCode: 'LA',
      lgaId: OFF_LGA.id,
    };

    beforeEach(() => {
      (prisma.geoState.findFirst as jest.Mock).mockResolvedValue({
        code: 'LA',
        name: 'Lagos',
        isActive: true,
      });
      (prisma.geoState.findUnique as jest.Mock).mockResolvedValue({
        code: 'LA',
        name: 'Lagos',
        isActive: true,
      });
    });

    it('does not link a new address to a deactivated LGA named by id', async () => {
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(OFF_LGA);
      const result = await service.normalizeForCreate({
        addressLine1: '1 Main St',
        city: 'Ikeja',
        state: 'Lagos',
        lgaId: OFF_LGA.id,
      });
      expect(result.lgaId).toBeNull();
      expect(result.stateCode).toBe('LA');
    });

    it('does not link a new address to a deactivated LGA named by text', async () => {
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(OFF_LGA);
      const result = await service.normalizeForCreate({
        addressLine1: '1 Main St',
        city: 'Ikeja',
        state: 'Lagos',
        administrativeAreaLevel2: 'Ikeja',
      });
      expect(result.lgaId).toBeNull();
    });

    it('still links a new address to an active LGA', async () => {
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(ON_LGA);
      const result = await service.normalizeForCreate({
        addressLine1: '1 Main St',
        city: 'Surulere',
        state: 'Lagos',
        lgaId: ON_LGA.id,
      });
      expect(result.lgaId).toBe(ON_LGA.id);
    });

    it('does not move a saved address to a deactivated LGA', async () => {
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(OFF_LGA);
      const result = await service.normalizeForUpdate(
        {
          ...savedWithOffLga,
          lgaId: ON_LGA.id,
          administrativeAreaLevel2: 'Surulere',
        },
        { lgaId: OFF_LGA.id },
      );
      expect(result.lgaId).toBeNull();
    });

    it('keeps the saved deactivated LGA when an edit does not touch the LGA', async () => {
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(OFF_LGA);
      const result = await service.normalizeForUpdate(savedWithOffLga, {
        addressLine1: '2 New Road',
      });
      expect(result.lgaId).toBe(OFF_LGA.id);
      expect(result.addressLine1).toBe('2 New Road');
    });
  });

  describe('one state per address: the code decides the text (TTW-216)', () => {
    type Row = { code: string; name: string; isActive: boolean };
    const rows: Row[] = [
      { code: 'LA', name: 'Lagos', isActive: true },
      { code: 'AB', name: 'Abia', isActive: false },
      { code: 'KN', name: 'Kano', isActive: true },
    ];
    type Where = {
      code?: string;
      isActive?: boolean;
      OR?: Array<{ code?: string; name?: { equals: string } }>;
    };
    // Fake table that honours the filters the service sends.
    const match = (where: Where) =>
      rows.find(
        (r) =>
          (where.code === undefined || r.code === where.code) &&
          (where.isActive === undefined || r.isActive === where.isActive) &&
          (where.OR === undefined ||
            where.OR.some(
              (c) =>
                (c.code !== undefined && r.code === c.code) ||
                (c.name !== undefined &&
                  r.name.toLowerCase() === c.name.equals.toLowerCase()),
            )),
      ) ?? null;

    const base = {
      addressLine1: '1 Main St',
      city: 'Ikeja',
      country: 'Nigeria',
    };
    // A saved row that contradicts itself: code LA (Lagos), text "Kano".
    const savedMismatch = {
      addressLine1: '1 Old Road',
      city: 'Ikeja',
      state: 'Kano',
      country: 'Nigeria',
      countryCode: 'NG',
      provider: AddressProvider.MANUAL,
      administrativeAreaLevel1: 'Kano',
      stateCode: 'LA',
      lgaId: null,
    };
    const savedAbia = {
      ...savedMismatch,
      state: 'Abia',
      administrativeAreaLevel1: 'Abia',
      stateCode: 'AB',
    };

    const expectMismatch = (promise: Promise<unknown>) =>
      expect(promise).rejects.toMatchObject({
        response: expect.objectContaining({
          statusCode: 400,
          code: 'ADDRESS_STATE_MISMATCH',
        }),
      });
    const expectUnknown = (promise: Promise<unknown>) =>
      expect(promise).rejects.toMatchObject({
        response: expect.objectContaining({
          statusCode: 400,
          code: 'ADDRESS_STATE_UNKNOWN',
        }),
      });

    beforeEach(() => {
      (prisma.geoState.findFirst as jest.Mock).mockImplementation(
        ({ where }: { where: Where }) => Promise.resolve(match(where)),
      );
      (prisma.geoState.findUnique as jest.Mock).mockImplementation(
        ({ where }: { where: Where }) => Promise.resolve(match(where)),
      );
      (prisma.geoLga.findFirst as jest.Mock).mockResolvedValue(null);
    });

    describe('create', () => {
      it('refuses an explicit code that names another state than the text', async () => {
        await expectMismatch(
          service.normalizeForCreate({
            ...base,
            stateCode: 'KN',
            state: 'Lagos',
          }),
        );
      });

      it('does not tell a deactivated state from an unknown text: the code decides', async () => {
        const result = await service.normalizeForCreate({
          ...base,
          stateCode: 'LA',
          state: 'Abia',
        });
        expect(result).toMatchObject({
          stateCode: 'LA',
          state: 'Lagos',
          administrativeAreaLevel1: 'Lagos',
        });
      });

      it('takes a text equal to a state code as that state', async () => {
        await expectMismatch(
          service.normalizeForCreate({ ...base, stateCode: 'KN', state: 'LA' }),
        );
        const result = await service.normalizeForCreate({
          ...base,
          state: 'LA',
        });
        expect(result).toMatchObject({ stateCode: 'LA', state: 'Lagos' });
      });

      it('accepts two texts that name the same state', async () => {
        const result = await service.normalizeForCreate({
          ...base,
          state: 'Lagos',
          administrativeAreaLevel1: 'LAGOS',
        });
        expect(result).toMatchObject({ stateCode: 'LA', state: 'Lagos' });
      });

      it('refuses an administrativeAreaLevel1 that contradicts the code', async () => {
        await expectMismatch(
          service.normalizeForCreate({
            ...base,
            stateCode: 'LA',
            administrativeAreaLevel1: 'Kano',
          }),
        );
      });

      it('refuses two state texts that name different states, without a code', async () => {
        await expectMismatch(
          service.normalizeForCreate({
            ...base,
            state: 'Lagos',
            administrativeAreaLevel1: 'Kano',
          }),
        );
      });

      it('stores the canonical name when the text is the same state in another case', async () => {
        const result = await service.normalizeForCreate({
          ...base,
          stateCode: 'la',
          state: '  LAGOS ',
          administrativeAreaLevel1: 'lagos',
        });
        expect(result).toMatchObject({
          stateCode: 'LA',
          state: 'Lagos',
          administrativeAreaLevel1: 'Lagos',
        });
      });

      it('replaces a text that matches no state by the canonical name of the code', async () => {
        const result = await service.normalizeForCreate({
          ...base,
          stateCode: 'LA',
          state: 'Lagos State',
        });
        expect(result).toMatchObject({
          stateCode: 'LA',
          state: 'Lagos',
          administrativeAreaLevel1: 'Lagos',
        });
      });

      it('stores the canonical name when only the code is sent', async () => {
        const result = await service.normalizeForCreate({
          ...base,
          stateCode: 'KN',
        });
        expect(result).toMatchObject({
          stateCode: 'KN',
          state: 'Kano',
          administrativeAreaLevel1: 'Kano',
        });
      });

      it('stores the canonical name when only a text is sent', async () => {
        const result = await service.normalizeForCreate({
          ...base,
          state: ' kano ',
        });
        expect(result).toMatchObject({
          stateCode: 'KN',
          state: 'Kano',
          administrativeAreaLevel1: 'Kano',
        });
      });

      it('keeps ADDRESS_STATE_UNKNOWN (not a mismatch) for a deactivated code with another state in the text', async () => {
        await expectUnknown(
          service.normalizeForCreate({
            ...base,
            stateCode: 'AB',
            state: 'Lagos',
          }),
        );
      });

      it('does not apply to a non-Nigerian address', async () => {
        const result = await service.normalizeForCreate({
          addressLine1: '1 High St',
          city: 'London',
          country: 'United Kingdom',
          countryCode: 'GB',
          state: 'England',
          stateCode: 'KN',
          administrativeAreaLevel1: 'Greater London',
        });
        expect(result).toMatchObject({
          countryCode: 'GB',
          state: 'England',
          administrativeAreaLevel1: 'Greater London',
        });
        expect(prisma.geoState.findFirst).not.toHaveBeenCalled();
        expect(prisma.geoState.findUnique).not.toHaveBeenCalled();
      });
    });

    describe('edit', () => {
      const savedLagos = {
        ...savedMismatch,
        state: 'Lagos',
        administrativeAreaLevel1: 'Lagos',
        stateCode: 'LA',
      };

      it('refuses the saved code resent with the text of another state (the TTW-194 LOW 1 case)', async () => {
        await expectMismatch(
          service.normalizeForUpdate(savedLagos, {
            stateCode: 'LA',
            state: 'Kano',
          }),
        );
      });

      it('refuses a move to a code whose text is another state', async () => {
        await expectMismatch(
          service.normalizeForUpdate(savedLagos, {
            stateCode: 'KN',
            state: 'Lagos',
          }),
        );
      });

      it('canonicalises the same state resent in another case', async () => {
        const result = await service.normalizeForUpdate(savedLagos, {
          stateCode: 'LA',
          state: 'LAGOS',
        });
        expect(result).toMatchObject({
          stateCode: 'LA',
          state: 'Lagos',
          administrativeAreaLevel1: 'Lagos',
        });
      });

      it('moves to the new code and stores its canonical name', async () => {
        const result = await service.normalizeForUpdate(savedLagos, {
          stateCode: 'KN',
        });
        expect(result).toMatchObject({
          stateCode: 'KN',
          state: 'Kano',
          administrativeAreaLevel1: 'Kano',
        });
      });

      it('lets the saved code decide when an edit names no state, on a saved mismatched row', async () => {
        const result = await service.normalizeForUpdate(savedMismatch, {
          phone: '+2348012345678',
        });
        expect(result).toMatchObject({
          stateCode: 'LA',
          state: 'Lagos',
          administrativeAreaLevel1: 'Lagos',
          phone: '+2348012345678',
        });
      });

      it('lets the saved code decide when the edit resends the saved code on a mismatched row', async () => {
        const result = await service.normalizeForUpdate(savedMismatch, {
          stateCode: 'LA',
          phone: '+2348012345678',
        });
        expect(result).toMatchObject({
          stateCode: 'LA',
          state: 'Lagos',
          administrativeAreaLevel1: 'Lagos',
        });
      });

      it('keeps a saved deactivated state editable on other fields and leaves its text alone', async () => {
        const result = await service.normalizeForUpdate(savedAbia, {
          phone: '+2348012345678',
        });
        expect(result).toMatchObject({
          stateCode: 'AB',
          state: 'Abia',
          administrativeAreaLevel1: 'Abia',
        });
      });

      it('still refuses a saved deactivated code resent with the text of another known state', async () => {
        await expectMismatch(
          service.normalizeForUpdate(savedAbia, {
            stateCode: 'AB',
            state: 'Lagos',
          }),
        );
      });

      it('keeps the saved code when the edit resends only the saved text of a mismatched row', async () => {
        const result = await service.normalizeForUpdate(savedMismatch, {
          state: 'Kano',
        });
        expect(result).toMatchObject({
          stateCode: 'LA',
          state: 'Lagos',
          administrativeAreaLevel1: 'Lagos',
        });
      });

      it('never lets the request text overwrite the saved text of a deactivated state', async () => {
        const result = await service.normalizeForUpdate(savedAbia, {
          stateCode: 'AB',
          state: 'foo',
        });
        expect(result).toMatchObject({
          stateCode: 'AB',
          state: 'Abia',
          administrativeAreaLevel1: 'Abia',
        });
      });

      it('keeps a saved deactivated state when the same code and text are resent', async () => {
        const result = await service.normalizeForUpdate(savedAbia, {
          stateCode: 'AB',
          state: 'Abia',
        });
        expect(result).toMatchObject({ stateCode: 'AB', state: 'Abia' });
      });
    });
  });
});
