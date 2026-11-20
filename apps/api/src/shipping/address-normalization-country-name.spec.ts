import { Test } from '@nestjs/testing';
import { PrismaService } from '../prisma/prisma.service';
import { AddressNormalizationService } from './address-normalization.service';
import { countryCodeFromName } from './country-code';
import { AddressProvider } from '../generated/prisma/enums';

/**
 * TTW-227: a country name sent without a country code must give the matching
 * code. Before, only "Nigeria" was recognised, so an edit that sent only
 * "Ghana" kept the saved NG and a create stored NG next to the text "Ghana".
 */
describe('countryCodeFromName (TTW-227)', () => {
  it.each([
    ['Ghana', 'GH'],
    ['ghana', 'GH'],
    ['  GHANA  ', 'GH'],
    ['Ｇｈａｎａ', 'GH'],
    ['United   Kingdom', 'GB'],
    ['united states', 'US'],
    ['Nigeria', 'NG'],
    ['NIGERIA', 'NG'],
  ])('%j gives %s', (name, code) => {
    expect(countryCodeFromName(name)).toBe(code);
  });

  it.each(['', '   ', 'Atlantis', 'GH', 'Gh a na', 'Nigeria!', 12, null])(
    '%j is not a country name',
    (value) => {
      expect(countryCodeFromName(value)).toBeNull();
    },
  );
});

describe('AddressNormalizationService - country name without a code (TTW-227)', () => {
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

  const createInput = {
    addressLine1: '5 Oxford Street',
    city: 'Accra',
    state: 'Greater Accra',
  };

  it('create: "Ghana" without a code stores GH', async () => {
    const result = await service.normalizeForCreate({
      ...createInput,
      country: 'Ghana',
    });
    expect(result).toMatchObject({
      country: 'Ghana',
      countryCode: 'GH',
      stateCode: null,
      lgaId: null,
    });
  });

  it('edit: a Nigerian address edited with only "Ghana" becomes GH and drops the Nigerian codes', async () => {
    const result = await service.normalizeForUpdate(savedNigerian, {
      country: 'Ghana',
      state: 'Greater Accra',
    });
    expect(result).toMatchObject({
      country: 'Ghana',
      countryCode: 'GH',
      stateCode: null,
      lgaId: null,
    });
  });

  it('edit: sending only { country: "Ghana" } drops the Nigerian codes and keeps the saved state text', async () => {
    const result = await service.normalizeForUpdate(savedNigerian, {
      country: 'Ghana',
    });
    expect(result).toMatchObject({
      country: 'Ghana',
      countryCode: 'GH',
      stateCode: null,
      lgaId: null,
      state: 'Lagos',
    });
  });

  it('edit: a foreign address edited back to "Nigeria" without a code becomes NG', async () => {
    const result = await service.normalizeForUpdate(
      {
        ...savedNigerian,
        country: 'Ghana',
        countryCode: 'GH',
        state: 'Greater Accra',
        administrativeAreaLevel1: 'Greater Accra',
        administrativeAreaLevel2: null,
        stateCode: null,
        lgaId: null,
      },
      { country: 'Nigeria', state: 'Lagos', administrativeAreaLevel2: 'Ikeja' },
    );
    expect(result.countryCode).toBe('NG');
    expect(result.stateCode).toBe('LA');
  });

  it('an explicit country code still wins over the name', async () => {
    const result = await service.normalizeForUpdate(savedNigerian, {
      country: 'Ghana',
      countryCode: 'NG',
    });
    expect(result.countryCode).toBe('NG');
  });

  it('a name we do not recognise keeps the saved code, as before', async () => {
    const result = await service.normalizeForUpdate(savedNigerian, {
      country: 'Atlantis',
    });
    expect(result.countryCode).toBe('NG');
  });

  it('an edit that does not send the country keeps the saved code', async () => {
    const result = await service.normalizeForUpdate(savedNigerian, {
      city: 'Ikeja GRA',
    });
    expect(result.countryCode).toBe('NG');
  });
});
