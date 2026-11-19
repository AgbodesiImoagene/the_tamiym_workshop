import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AddressNormalizationService } from './address-normalization.service';
import { AddressProvider } from '../generated/prisma/enums';

/**
 * TTW-226: a Nigerian state code and LGA belong to a Nigerian address only.
 * Moving an address out of Nigeria drops them (the state text stays); moving it
 * into Nigeria applies the Nigerian rules as for any Nigerian address.
 */
describe('AddressNormalizationService - country change (TTW-226)', () => {
  let service: AddressNormalizationService;
  let prisma: {
    geoState: { findUnique: jest.Mock; findFirst: jest.Mock };
    geoLga: { findFirst: jest.Mock; count: jest.Mock };
  };
  const lagos = { code: 'LA', name: 'Lagos', isActive: true };

  const savedNigerian = {
    addressLine1: '1 Allen Avenue',
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

  beforeEach(async () => {
    prisma = {
      geoState: {
        findUnique: jest.fn().mockResolvedValue(lagos),
        findFirst: jest.fn().mockResolvedValue(lagos),
      },
      geoLga: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'lga-ikeja',
          name: 'Ikeja',
          isActive: true,
        }),
        count: jest.fn().mockResolvedValue(1),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        AddressNormalizationService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(AddressNormalizationService);
  });

  it('drops the Nigerian state code and LGA when the country changes, and keeps the text sent', async () => {
    const result = await service.normalizeForUpdate(savedNigerian, {
      countryCode: 'GH',
      country: 'Ghana',
      state: 'Greater Accra',
    });
    expect(result).toMatchObject({
      countryCode: 'GH',
      country: 'Ghana',
      stateCode: null,
      lgaId: null,
      state: 'Greater Accra',
      administrativeAreaLevel1: 'Greater Accra',
    });
    expect(result.normalizationMetadata).toMatchObject({
      resolvedStateCode: null,
      resolvedLgaId: null,
    });
  });

  it('does not keep the Nigerian LGA name on the foreign address', async () => {
    const result = await service.normalizeForUpdate(savedNigerian, {
      countryCode: 'GH',
      state: 'Greater Accra',
    });
    expect(result.administrativeAreaLevel2).toBeNull();
  });

  it('keeps an LGA text the customer sent for the foreign address', async () => {
    const result = await service.normalizeForUpdate(savedNigerian, {
      countryCode: 'GH',
      state: 'Greater Accra',
      administrativeAreaLevel2: 'Tema',
    });
    expect(result.administrativeAreaLevel2).toBe('Tema');
    expect(result.lgaId).toBeNull();
  });

  it('drops the codes even when the same edit still resends the old state code and LGA id', async () => {
    const result = await service.normalizeForUpdate(savedNigerian, {
      countryCode: 'GH',
      state: 'Greater Accra',
      stateCode: 'LA',
      lgaId: 'lga-ikeja',
    });
    expect(result).toMatchObject({ stateCode: null, lgaId: null });
  });

  it('drops the codes when only the country changes (the saved state text stays)', async () => {
    const result = await service.normalizeForUpdate(savedNigerian, {
      countryCode: 'GH',
    });
    expect(result).toMatchObject({
      countryCode: 'GH',
      stateCode: null,
      lgaId: null,
      state: 'Lagos',
    });
  });

  it('drops a code that a legacy foreign address still carries on any edit', async () => {
    const result = await service.normalizeForUpdate(
      { ...savedNigerian, countryCode: 'GH', country: 'Ghana' },
      { phone: '+233201234567' },
    );
    expect(result).toMatchObject({ stateCode: null, lgaId: null });
  });

  it('never attaches a state code to a new foreign address', async () => {
    const result = await service.normalizeForCreate({
      addressLine1: '1 Main Street',
      city: 'Accra',
      state: 'Greater Accra',
      countryCode: 'GH',
      stateCode: 'LA',
      lgaId: 'lga-ikeja',
    });
    expect(result).toMatchObject({ stateCode: null, lgaId: null });
  });

  describe('moving into Nigeria', () => {
    const savedGhana = {
      ...savedNigerian,
      countryCode: 'GH',
      country: 'Ghana',
      state: 'Greater Accra',
      administrativeAreaLevel1: 'Greater Accra',
      administrativeAreaLevel2: null,
      stateCode: null,
      lgaId: null,
    };

    it('applies the Nigerian rules: a known state and an LGA resolve', async () => {
      const result = await service.normalizeForUpdate(savedGhana, {
        countryCode: 'NG',
        country: 'Nigeria',
        state: 'Lagos',
        administrativeAreaLevel2: 'Ikeja',
      });
      expect(result).toMatchObject({
        countryCode: 'NG',
        stateCode: 'LA',
        lgaId: 'lga-ikeja',
      });
    });

    it('still refuses an unknown Nigerian state', async () => {
      prisma.geoState.findFirst.mockResolvedValue(null);
      prisma.geoState.findUnique.mockResolvedValue(null);
      await expect(
        service.normalizeForUpdate(savedGhana, {
          countryCode: 'NG',
          state: 'Nowhereland',
        }),
      ).rejects.toMatchObject({ response: { code: 'ADDRESS_STATE_UNKNOWN' } });
    });

    it('still refuses a state that has LGAs when none is given', async () => {
      await expect(
        service.normalizeForUpdate(savedGhana, {
          countryCode: 'NG',
          state: 'Lagos',
        }),
      ).rejects.toMatchObject({ response: { code: 'ADDRESS_LGA_REQUIRED' } });
    });
  });
});
