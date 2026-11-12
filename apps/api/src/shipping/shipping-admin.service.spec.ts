import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ShippingRuleMatchType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingAdminService } from './shipping-admin.service';

const ACTIVE_STATE = { code: 'LA', name: 'Lagos', isActive: true };
const OFF_STATE = { code: 'ZT', name: 'Zeta Test State', isActive: false };
const OTHER_OFF_STATE = { code: 'ZU', name: 'Upsilon State', isActive: false };
const LGA = { id: 'lga-1', name: 'Ikeja', stateCode: 'ZT', isActive: true };

/**
 * TTW-200: a new shipping rule (or legacy area) cannot name a state an admin
 * deactivated, since no address can name that state any more (TTW-194). Rules
 * that already exist stay as they are and stay editable.
 */
describe('ShippingAdminService - deactivated state', () => {
  let service: ShippingAdminService;
  let prisma: {
    shippingZone: { findUnique: jest.Mock };
    shippingZoneRule: {
      create: jest.Mock;
      update: jest.Mock;
      findUnique: jest.Mock;
    };
    geoState: { findFirst: jest.Mock; findUnique: jest.Mock };
    geoLga: { findFirst: jest.Mock };
    $transaction: jest.Mock;
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
      geoState: { findFirst: jest.fn(), findUnique: jest.fn() },
      geoLga: { findFirst: jest.fn().mockResolvedValue(LGA) },
      $transaction: jest.fn(),
    };
    const module = await Test.createTestingModule({
      providers: [
        ShippingAdminService,
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();
    service = module.get(ShippingAdminService);
  });

  const adminOne = (matchValue: string) => ({
    countryCode: 'NG',
    matchType: ShippingRuleMatchType.ADMIN1,
    matchValue,
  });
  const adminTwo = (matchContext: string) => ({
    countryCode: 'NG',
    matchType: ShippingRuleMatchType.ADMIN2,
    matchValue: 'Ikeja',
    matchContext,
  });

  describe('createRule', () => {
    it('refuses an ADMIN1 rule that names a deactivated state by code', async () => {
      prisma.geoState.findFirst.mockResolvedValue(OFF_STATE);
      await expect(service.createRule('z1', adminOne('zt'))).rejects.toThrow(
        new BadRequestException('State ZT is deactivated'),
      );
      expect(prisma.shippingZoneRule.create).not.toHaveBeenCalled();
    });

    it('refuses an ADMIN1 rule that names a deactivated state by name', async () => {
      prisma.geoState.findFirst.mockResolvedValue(OFF_STATE);
      await expect(
        service.createRule('z1', adminOne('Zeta Test State')),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.shippingZoneRule.create).not.toHaveBeenCalled();
    });

    it('refuses an ADMIN2 rule whose parent state is deactivated', async () => {
      prisma.geoState.findUnique.mockResolvedValue(OFF_STATE);
      await expect(service.createRule('z1', adminTwo('ZT'))).rejects.toThrow(
        new BadRequestException('State ZT is deactivated'),
      );
      expect(prisma.shippingZoneRule.create).not.toHaveBeenCalled();
    });

    it('still creates an ADMIN1 rule for an active state', async () => {
      prisma.geoState.findFirst.mockResolvedValue(ACTIVE_STATE);
      await service.createRule('z1', adminOne('LA'));
      expect(prisma.shippingZoneRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ zoneId: 'z1', matchValue: 'LA' }),
      });
    });

    it('still creates an ADMIN2 rule for an active state', async () => {
      prisma.geoState.findUnique.mockResolvedValue(ACTIVE_STATE);
      await service.createRule('z1', adminTwo('LA'));
      expect(prisma.shippingZoneRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          matchValue: LGA.id,
          matchContext: 'LA',
        }),
      });
    });
  });

  describe('createArea (legacy endpoint)', () => {
    it('refuses an area in a deactivated state and writes nothing', async () => {
      prisma.geoState.findUnique.mockResolvedValue(OFF_STATE);
      await expect(
        service.createArea('z1', { stateCode: 'ZT' }),
      ).rejects.toThrow(new BadRequestException('State ZT is deactivated'));
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('createArea with an LGA', () => {
    it('refuses an LGA area in a deactivated state and writes nothing', async () => {
      prisma.geoState.findUnique.mockResolvedValue(OFF_STATE);
      await expect(
        service.createArea('z1', { stateCode: 'ZT', lgaId: LGA.id }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('updateRule', () => {
    const existingAdminOne = {
      id: 'r1',
      zoneId: 'z1',
      countryCode: 'NG',
      matchType: ShippingRuleMatchType.ADMIN1,
      matchValue: 'ZT',
      matchContext: null,
      priority: 200,
      isActive: true,
    };

    it('lets an existing rule of a deactivated state change priority and be switched off', async () => {
      prisma.shippingZoneRule.findUnique.mockResolvedValue(existingAdminOne);
      prisma.geoState.findFirst.mockResolvedValue(OFF_STATE);
      await service.updateRule('r1', { priority: 50, isActive: false });
      expect(prisma.shippingZoneRule.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: expect.objectContaining({
          matchValue: 'ZT',
          priority: 50,
          isActive: false,
        }),
      });
    });

    it('lets an existing ADMIN2 rule of a deactivated state be edited', async () => {
      prisma.shippingZoneRule.findUnique.mockResolvedValue({
        ...existingAdminOne,
        matchType: ShippingRuleMatchType.ADMIN2,
        matchValue: LGA.id,
        matchContext: 'ZT',
      });
      prisma.geoState.findUnique.mockResolvedValue(OFF_STATE);
      await service.updateRule('r1', { priority: 50 });
      expect(prisma.shippingZoneRule.update).toHaveBeenCalled();
    });

    it('lets an existing rule of a deactivated state be switched back on', async () => {
      prisma.shippingZoneRule.findUnique.mockResolvedValue({
        ...existingAdminOne,
        isActive: false,
      });
      prisma.geoState.findFirst.mockResolvedValue(OFF_STATE);
      await service.updateRule('r1', { isActive: true });
      expect(prisma.shippingZoneRule.update).toHaveBeenCalled();
    });

    it('refuses to point an existing rule at another deactivated state', async () => {
      prisma.shippingZoneRule.findUnique.mockResolvedValue({
        ...existingAdminOne,
        matchValue: 'LA',
      });
      prisma.geoState.findFirst.mockResolvedValue(OTHER_OFF_STATE);
      await expect(
        service.updateRule('r1', { matchValue: 'ZU' }),
      ).rejects.toThrow(new BadRequestException('State ZU is deactivated'));
      expect(prisma.shippingZoneRule.update).not.toHaveBeenCalled();
    });

    it('still lets an existing rule move to an active state', async () => {
      prisma.shippingZoneRule.findUnique.mockResolvedValue(existingAdminOne);
      prisma.geoState.findFirst.mockResolvedValue(ACTIVE_STATE);
      await service.updateRule('r1', { matchValue: 'LA' });
      expect(prisma.shippingZoneRule.update).toHaveBeenCalled();
    });
  });

  /**
   * TTW-202: same rule for a deactivated LGA of an active state. A new rule
   * or area for it could never match a customer, since customers only see
   * active LGAs. Existing rules stay as they are and stay editable.
   */
  describe('deactivated LGA (TTW-202)', () => {
    const OFF_LGA = {
      id: 'lga-off',
      name: 'Ikeja',
      stateCode: 'LA',
      isActive: false,
    };
    const ON_LGA = {
      id: 'lga-on',
      name: 'Surulere',
      stateCode: 'LA',
      isActive: true,
    };
    const existingAdminTwo = {
      id: 'r1',
      zoneId: 'z1',
      countryCode: 'NG',
      matchType: ShippingRuleMatchType.ADMIN2,
      matchValue: OFF_LGA.id,
      matchContext: 'LA',
      priority: 100,
      isActive: true,
    };

    beforeEach(() => {
      prisma.geoState.findUnique.mockResolvedValue(ACTIVE_STATE);
    });

    it('refuses an ADMIN2 rule whose LGA is deactivated', async () => {
      prisma.geoLga.findFirst.mockResolvedValue(OFF_LGA);
      await expect(service.createRule('z1', adminTwo('LA'))).rejects.toThrow(
        new BadRequestException('LGA Ikeja is deactivated'),
      );
      expect(prisma.shippingZoneRule.create).not.toHaveBeenCalled();
    });

    it('refuses an ADMIN2 rule that names a deactivated LGA by name', async () => {
      prisma.geoLga.findFirst.mockResolvedValue(OFF_LGA);
      await expect(
        service.createRule('z1', adminTwo('LA')),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.geoLga.findFirst).toHaveBeenCalledWith({
        where: expect.objectContaining({
          OR: expect.arrayContaining([
            { name: { equals: 'Ikeja', mode: 'insensitive' } },
          ]),
        }),
      });
    });

    it('still creates an ADMIN2 rule for an active LGA', async () => {
      prisma.geoLga.findFirst.mockResolvedValue(ON_LGA);
      await service.createRule('z1', adminTwo('LA'));
      expect(prisma.shippingZoneRule.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ matchValue: ON_LGA.id }),
      });
    });

    it('keeps the state message when both the state and the LGA are deactivated', async () => {
      prisma.geoState.findUnique.mockResolvedValue(OFF_STATE);
      prisma.geoLga.findFirst.mockResolvedValue({
        ...OFF_LGA,
        stateCode: 'ZT',
      });
      await expect(service.createRule('z1', adminTwo('ZT'))).rejects.toThrow(
        new BadRequestException('State ZT is deactivated'),
      );
    });

    it('refuses an LGA area whose LGA is deactivated and writes nothing', async () => {
      prisma.geoLga.findFirst.mockResolvedValue(OFF_LGA);
      await expect(
        service.createArea('z1', { stateCode: 'LA', lgaId: OFF_LGA.id }),
      ).rejects.toThrow(new BadRequestException('LGA Ikeja is deactivated'));
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('still creates an LGA area for an active LGA', async () => {
      prisma.geoLga.findFirst.mockResolvedValue(ON_LGA);
      await service.createArea('z1', { stateCode: 'LA', lgaId: ON_LGA.id });
      expect(prisma.$transaction).toHaveBeenCalled();
    });

    it('lets an existing rule of a deactivated LGA change priority and be switched off', async () => {
      prisma.shippingZoneRule.findUnique.mockResolvedValue(existingAdminTwo);
      prisma.geoLga.findFirst.mockResolvedValue(OFF_LGA);
      await service.updateRule('r1', { priority: 50, isActive: false });
      expect(prisma.shippingZoneRule.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: expect.objectContaining({
          matchValue: OFF_LGA.id,
          priority: 50,
          isActive: false,
        }),
      });
    });

    it('lets an existing rule of a deactivated LGA be switched back on', async () => {
      prisma.shippingZoneRule.findUnique.mockResolvedValue({
        ...existingAdminTwo,
        isActive: false,
      });
      prisma.geoLga.findFirst.mockResolvedValue(OFF_LGA);
      await service.updateRule('r1', { isActive: true });
      expect(prisma.shippingZoneRule.update).toHaveBeenCalled();
    });

    it('refuses to move an existing rule to a deactivated LGA', async () => {
      prisma.shippingZoneRule.findUnique.mockResolvedValue({
        ...existingAdminTwo,
        matchValue: ON_LGA.id,
      });
      prisma.geoLga.findFirst.mockResolvedValue(OFF_LGA);
      await expect(
        service.updateRule('r1', { matchValue: OFF_LGA.id }),
      ).rejects.toThrow(new BadRequestException('LGA Ikeja is deactivated'));
      expect(prisma.shippingZoneRule.update).not.toHaveBeenCalled();
    });

    it('still lets an existing rule move to an active LGA', async () => {
      prisma.shippingZoneRule.findUnique.mockResolvedValue(existingAdminTwo);
      prisma.geoLga.findFirst.mockResolvedValue(ON_LGA);
      await service.updateRule('r1', { matchValue: ON_LGA.id });
      expect(prisma.shippingZoneRule.update).toHaveBeenCalled();
    });
  });
});

/**
 * TTW-199: the admin geo lists keep deactivated states and LGAs so an admin
 * can still see them. The customer-facing lists (GeoService) stay active-only.
 */
describe('ShippingAdminService geo lists', () => {
  const lagos = { code: 'LA', name: 'Lagos', isActive: true };
  const closed = { code: 'ZZ', name: 'Closed', isActive: false };
  const lgas = [
    { id: 'l1', stateCode: 'ZZ', name: 'Active LGA', isActive: true },
    { id: 'l2', stateCode: 'ZZ', name: 'Off LGA', isActive: false },
  ];

  function build() {
    const prisma = {
      geoState: {
        findMany: jest.fn().mockResolvedValue([lagos, closed]),
        findUnique: jest.fn(),
      },
      geoLga: { findMany: jest.fn().mockResolvedValue(lgas) },
    };
    const service = new ShippingAdminService(
      prisma as unknown as PrismaService,
    );
    return { prisma, service };
  }

  it('lists states without filtering on isActive, and keeps the flag', async () => {
    const { prisma, service } = build();
    const result = await service.listStates();
    const args = prisma.geoState.findMany.mock.calls[0][0] as {
      where?: Record<string, unknown>;
    };
    expect(args.where ?? {}).not.toHaveProperty('isActive');
    expect(result).toEqual([lagos, closed]);
  });

  it('lists the LGAs of a deactivated state, including deactivated LGAs', async () => {
    const { prisma, service } = build();
    prisma.geoState.findUnique.mockResolvedValue({ code: 'ZZ' });
    const result = await service.listLgas('ZZ');
    const args = prisma.geoLga.findMany.mock.calls[0][0] as {
      where: Record<string, unknown>;
    };
    expect(args.where).toEqual({ stateCode: 'ZZ' });
    expect(result).toEqual(lgas);
  });

  it('still returns an empty list for an unknown state', async () => {
    const { prisma, service } = build();
    prisma.geoState.findUnique.mockResolvedValue(null);
    await expect(service.listLgas('NOPE')).resolves.toEqual([]);
    expect(prisma.geoLga.findMany).not.toHaveBeenCalled();
  });
});
