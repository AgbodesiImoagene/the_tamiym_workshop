import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ShippingRuleMatchType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingAdminService } from './shipping-admin.service';

/**
 * TTW-226: an admin shipping rule reads its country code with the same rule as
 * an address (`canonicalCountryCode`): a look-alike form is folded, a value
 * that is not a real code is refused with 400, and a rule saved earlier stays
 * readable and editable.
 */
describe('ShippingAdminService - country code (TTW-226)', () => {
  let service: ShippingAdminService;
  let prisma: {
    shippingZone: { findUnique: jest.Mock };
    shippingZoneRule: {
      create: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
    };
    geoState: { findFirst: jest.Mock; findUnique: jest.Mock };
  };

  beforeEach(async () => {
    prisma = {
      shippingZone: { findUnique: jest.fn().mockResolvedValue({ id: 'z1' }) },
      shippingZoneRule: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'r1', ...data })),
        update: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'r1', ...data })),
        findUnique: jest.fn(),
      },
      geoState: {
        findFirst: jest
          .fn()
          .mockResolvedValue({ code: 'LA', name: 'Lagos', isActive: true }),
        findUnique: jest.fn(),
      },
    };
    const module = await Test.createTestingModule({
      providers: [
        ShippingAdminService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ShippingAdminService);
  });

  const rule = (countryCode: unknown, matchValue = 'LA') => ({
    countryCode: countryCode as string,
    matchType: ShippingRuleMatchType.ADMIN1,
    matchValue,
  });

  it.each([
    ['ＮＧ', 'NG'],
    ['ng', 'NG'],
    [' Ng ', 'NG'],
  ])(
    'createRule folds %j to %s and applies the Nigerian checks',
    async (value, stored) => {
      await service.createRule('z1', rule(value));
      expect(prisma.geoState.findFirst).toHaveBeenCalled();
      expect(prisma.shippingZoneRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          countryCode: stored,
          matchValue: 'LA',
        }),
      });
    },
  );

  it('createRule keeps a valid foreign code', async () => {
    await service.createRule('z1', rule('gh', 'Accra'));
    expect(prisma.shippingZoneRule.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ countryCode: 'GH' }),
    });
  });

  it.each(['XX', 'N1', 'NGA', 'ıt', 'Ｎ', 7, '  '])(
    'createRule refuses %j with a clear 400 and writes nothing',
    async (value) => {
      await expect(service.createRule('z1', rule(value))).rejects.toThrow(
        new BadRequestException(
          'countryCode must be a valid ISO 3166-1 alpha-2 code',
        ),
      );
      expect(prisma.shippingZoneRule.create).not.toHaveBeenCalled();
    },
  );

  describe('updateRule', () => {
    const saved = (countryCode: string) => ({
      id: 'r1',
      zoneId: 'z1',
      countryCode,
      matchType: ShippingRuleMatchType.ADMIN1,
      matchValue: 'Accra',
      matchContext: null,
      priority: 100,
      isActive: true,
    });

    it('refuses a new code that is not a real code', async () => {
      prisma.shippingZoneRule.findUnique.mockResolvedValue(saved('GH'));
      await expect(
        service.updateRule('r1', { countryCode: 'XX' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.shippingZoneRule.update).not.toHaveBeenCalled();
    });

    it('lets a rule saved with a bad code be edited on other fields', async () => {
      prisma.shippingZoneRule.findUnique.mockResolvedValue(saved('XX'));
      await service.updateRule('r1', { priority: 5 });
      expect(prisma.shippingZoneRule.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: expect.objectContaining({ countryCode: 'XX', priority: 5 }),
      });
    });

    it('lets a full-width rule on a deactivated state be edited on other fields (TTW-200 keeps it)', async () => {
      prisma.geoState.findFirst.mockResolvedValue({
        code: 'ZT',
        name: 'Zeta',
        isActive: false,
      });
      prisma.shippingZoneRule.findUnique.mockResolvedValue({
        ...saved('\uFF2E\uFF27'),
        matchValue: 'ZT',
      });
      await service.updateRule('r1', { priority: 5 });
      expect(prisma.shippingZoneRule.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: expect.objectContaining({ countryCode: 'NG', priority: 5 }),
      });
    });

    it('heals a rule saved with a full-width code when it is edited', async () => {
      prisma.shippingZoneRule.findUnique.mockResolvedValue({
        ...saved('ＮＧ'),
        matchValue: 'LA',
      });
      await service.updateRule('r1', { priority: 5 });
      expect(prisma.shippingZoneRule.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: expect.objectContaining({ countryCode: 'NG' }),
      });
    });
  });
});
