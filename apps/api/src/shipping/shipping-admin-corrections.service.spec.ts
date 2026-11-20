import { ConflictException, NotFoundException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingAdminService } from './shipping-admin.service';

/**
 * TTW-097: an admin can remove an area from a zone, and any change that would
 * leave a state without delivery is refused until the admin acknowledges it.
 * Every correction is audited.
 */
describe('ShippingAdminService - corrections (TTW-097)', () => {
  let service: ShippingAdminService;
  let audit: { log: jest.Mock };
  let prisma: {
    shippingZone: {
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    shippingZoneArea: { findFirst: jest.Mock; delete: jest.Mock };
    shippingZoneRule: {
      deleteMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    shippingRate: {
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
    };
    geoState: { findMany: jest.Mock; findFirst?: jest.Mock };
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
  };

  const AREA = {
    id: 'area-1',
    zoneId: 'z1',
    stateCode: 'ZP',
    lgaId: null,
  };
  const RULE = {
    id: 'rule-1',
    zoneId: 'z1',
    countryCode: 'NG',
    matchType: 'ADMIN1',
    matchValue: 'ZP',
    matchContext: null,
    priority: 200,
    isActive: true,
  };
  const COVERED = (codes: string[]) =>
    codes.length === 0
      ? []
      : [
          {
            rules: codes.map((code) => ({
              matchType: 'ADMIN1',
              matchValue: code,
              matchContext: null,
            })),
          },
        ];

  beforeEach(async () => {
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      shippingZone: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ id: 'z1', name: 'Lagos zone', isActive: true }),
        findMany: jest.fn(),
        update: jest
          .fn()
          .mockResolvedValue({ id: 'z1', name: 'Lagos zone', isActive: false }),
        delete: jest.fn().mockResolvedValue({ id: 'z1' }),
      },
      shippingZoneArea: {
        findFirst: jest.fn().mockResolvedValue(AREA),
        delete: jest.fn().mockResolvedValue(AREA),
      },
      shippingZoneRule: {
        deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
        findUnique: jest.fn().mockResolvedValue(RULE),
        update: jest.fn().mockResolvedValue({ ...RULE, priority: 50 }),
        delete: jest.fn().mockResolvedValue(RULE),
      },
      shippingRate: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'rate-1',
          zoneId: 'z1',
          provider: 'INTERNAL',
          serviceLevel: 'STANDARD',
          currency: 'NGN',
          flatFee: 1500,
          priority: 100,
          isActive: true,
          effectiveFrom: null,
          effectiveTo: null,
          minDeliveryDays: null,
          maxDeliveryDays: null,
        }),
        update: jest.fn().mockResolvedValue({ id: 'rate-1', flatFee: 2000 }),
        delete: jest.fn().mockResolvedValue({ id: 'rate-1' }),
      },
      geoState: {
        findMany: jest.fn().mockResolvedValue([{ code: 'ZP', name: 'Zed P' }]),
      },
      $transaction: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
    };
    prisma.$transaction.mockImplementation((cb: (tx: unknown) => unknown) =>
      cb(prisma),
    );
    const module = await Test.createTestingModule({
      providers: [
        ShippingAdminService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();
    service = module.get(ShippingAdminService);
  });

  describe('deleteArea', () => {
    it('removes the area and its matching rule, and audits it', async () => {
      prisma.shippingZone.findMany
        .mockResolvedValueOnce(COVERED(['ZP', 'ZQ']))
        .mockResolvedValueOnce(COVERED(['ZP', 'ZQ']));

      await service.deleteArea('z1', 'area-1');

      expect(prisma.shippingZoneArea.delete).toHaveBeenCalledWith({
        where: { id: 'area-1' },
      });
      expect(prisma.shippingZoneRule.deleteMany).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'shipping.area.deleted',
          entityType: 'ShippingZoneArea',
          entityId: 'area-1',
        }),
      );
    });

    it('answers 404 when the area is not in that zone, and writes nothing', async () => {
      prisma.shippingZoneArea.findFirst.mockResolvedValue(null);

      await expect(service.deleteArea('z1', 'nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.shippingZoneArea.delete).not.toHaveBeenCalled();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('refuses with 409 when a state would lose delivery, naming the state', async () => {
      prisma.shippingZone.findMany
        .mockResolvedValueOnce(COVERED(['ZP']))
        .mockResolvedValueOnce(COVERED([]));

      const error: unknown = await service.deleteArea('z1', 'area-1').then(
        () => undefined,
        (e: unknown) => e,
      );

      expect(error).toBeInstanceOf(ConflictException);
      expect((error as ConflictException).getResponse()).toMatchObject({
        code: 'SHIPPING_COVERAGE_WOULD_BE_LOST',
        uncoveredStates: [{ code: 'ZP', name: 'Zed P' }],
      });
      // The 409 rolls the delete back, and nothing is audited.
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('goes ahead when the admin acknowledged the coverage loss', async () => {
      prisma.shippingZone.findMany
        .mockResolvedValueOnce(COVERED(['ZP']))
        .mockResolvedValueOnce(COVERED([]));

      await service.deleteArea('z1', 'area-1', {
        acknowledgeCoverageLoss: true,
      });

      expect(prisma.shippingZoneArea.delete).toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateRate', () => {
    it('audits the change with the before and after fee', async () => {
      prisma.shippingZone.findMany
        .mockResolvedValueOnce(COVERED(['ZP']))
        .mockResolvedValueOnce(COVERED(['ZP']));

      await service.updateRate('rate-1', { flatFee: 2000 });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'shipping.rate.updated',
          entityType: 'ShippingRate',
          entityId: 'rate-1',
          before: expect.objectContaining({ flatFee: 1500 }),
        }),
      );
    });

    it('answers 404 for an unknown rate and writes nothing', async () => {
      prisma.shippingRate.findUnique.mockResolvedValue(null);

      await expect(
        service.updateRate('nope', { flatFee: 1 }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.shippingRate.update).not.toHaveBeenCalled();
    });
  });

  describe('deleteRate', () => {
    it('deletes the rate and audits it', async () => {
      prisma.shippingZone.findMany
        .mockResolvedValueOnce(COVERED(['ZP']))
        .mockResolvedValueOnce(COVERED(['ZP']));

      await service.deleteRate('rate-1');

      expect(prisma.shippingRate.delete).toHaveBeenCalledWith({
        where: { id: 'rate-1' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'shipping.rate.deleted' }),
      );
    });

    it('answers 404 for an unknown rate', async () => {
      prisma.shippingRate.findUnique.mockResolvedValue(null);

      await expect(service.deleteRate('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.shippingRate.delete).not.toHaveBeenCalled();
    });

    it('refuses with 409 when it was the last rate covering a state', async () => {
      prisma.shippingZone.findMany
        .mockResolvedValueOnce(COVERED(['ZP']))
        .mockResolvedValueOnce(COVERED([]));

      await expect(service.deleteRate('rate-1')).rejects.toBeInstanceOf(
        ConflictException,
      );
    });
  });

  describe('rules', () => {
    it('updates a rule and audits before/after', async () => {
      prisma.shippingZone.findMany.mockResolvedValue(COVERED(['ZP']));
      prisma.geoState.findFirst = jest
        .fn()
        .mockResolvedValue({ code: 'ZP', name: 'Zed P', isActive: true });

      await service.updateRule('rule-1', { priority: 50 });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'shipping.rule.updated',
          entityType: 'ShippingZoneRule',
          before: expect.objectContaining({ priority: 200 }),
          after: expect.objectContaining({ priority: 50 }),
        }),
      );
    });

    it('deletes a rule and audits it', async () => {
      prisma.shippingZone.findMany.mockResolvedValue(COVERED(['ZP']));

      await service.deleteRule('rule-1');

      expect(prisma.shippingZoneRule.delete).toHaveBeenCalledWith({
        where: { id: 'rule-1' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'shipping.rule.deleted' }),
      );
    });

    it('answers 404 for an unknown rule', async () => {
      prisma.shippingZoneRule.findUnique.mockResolvedValue(null);

      await expect(service.deleteRule('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.shippingZoneRule.delete).not.toHaveBeenCalled();
    });
  });

  describe('zones', () => {
    it('deactivating the only zone of a state is refused with 409', async () => {
      prisma.shippingZone.findMany
        .mockResolvedValueOnce(COVERED(['ZP']))
        .mockResolvedValueOnce(COVERED([]));

      await expect(
        service.updateZone('z1', { isActive: false }),
      ).rejects.toBeInstanceOf(ConflictException);
    });

    it('renames a zone and audits before/after', async () => {
      prisma.shippingZone.findMany.mockResolvedValue(COVERED(['ZP']));

      await service.updateZone('z1', { name: 'Renamed' });

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'shipping.zone.updated',
          entityType: 'ShippingZone',
          before: expect.objectContaining({ name: 'Lagos zone' }),
        }),
      );
    });

    it('answers 404 when the zone does not exist', async () => {
      prisma.shippingZone.findUnique.mockResolvedValue(null);

      await expect(service.updateZone('nope', {})).rejects.toBeInstanceOf(
        NotFoundException,
      );
      await expect(service.deleteZone('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(prisma.shippingZone.delete).not.toHaveBeenCalled();
    });

    it('deletes a zone and audits it once acknowledged', async () => {
      await service.deleteZone('z1', { acknowledgeCoverageLoss: true });

      expect(prisma.shippingZone.delete).toHaveBeenCalledWith({
        where: { id: 'z1' },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ eventName: 'shipping.zone.deleted' }),
      );
    });
  });

  describe('deleteArea with an LGA', () => {
    it('removes the ADMIN2 rule of that LGA, not the state rule', async () => {
      prisma.shippingZoneArea.findFirst.mockResolvedValue({
        ...AREA,
        lgaId: 'lga-1',
      });
      prisma.shippingZone.findMany.mockResolvedValue(COVERED(['ZP']));

      await service.deleteArea('z1', 'area-1');

      expect(prisma.shippingZoneRule.deleteMany).toHaveBeenCalledWith({
        where: {
          zoneId: 'z1',
          countryCode: 'NG',
          matchType: 'ADMIN2',
          matchValue: 'lga-1',
          matchContext: 'ZP',
        },
      });
    });
  });

  describe('coverage of ADMIN2 rules', () => {
    it('counts the parent state of an LGA rule as covered', async () => {
      prisma.shippingZone.findMany
        .mockResolvedValueOnce([
          {
            rules: [
              { matchType: 'ADMIN2', matchValue: 'lga-1', matchContext: 'ZP' },
            ],
          },
        ])
        .mockResolvedValueOnce(COVERED([]));

      await expect(service.deleteRate('rate-1')).rejects.toMatchObject({
        response: { uncoveredStates: [{ code: 'ZP' }] },
      });
    });
  });

  describe('concurrency and cost (review fixes)', () => {
    it('answers 404, not 500, when the row was deleted after the read (P2025)', async () => {
      prisma.shippingRate.delete.mockRejectedValue({ code: 'P2025' });

      await expect(
        service.deleteRate('rate-1', { acknowledgeCoverageLoss: true }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('rethrows any other database error untouched', async () => {
      const boom = new Error('boom');
      prisma.shippingRate.delete.mockRejectedValue(boom);

      await expect(
        service.deleteRate('rate-1', { acknowledgeCoverageLoss: true }),
      ).rejects.toBe(boom);
    });

    it('skips the coverage scans for a change that cannot affect coverage', async () => {
      await service.updateRate('rate-1', { flatFee: 2000, priority: 5 });
      await service.updateZone('z1', { name: 'Renamed' });

      expect(prisma.shippingZone.findMany).not.toHaveBeenCalled();
      expect(audit.log).toHaveBeenCalledTimes(2);
    });

    it('still scans when a rate window or active flag changes', async () => {
      prisma.shippingZone.findMany.mockResolvedValue(COVERED(['ZP']));

      await service.updateRate('rate-1', { effectiveTo: '2020-01-01' });
      await service.updateRate('rate-1', { isActive: false });

      expect(prisma.shippingZone.findMany).toHaveBeenCalledTimes(4);
    });

    it('scans when the service level, provider or currency of a rate changes', async () => {
      prisma.shippingZone.findMany.mockResolvedValue(COVERED(['ZP']));

      await service.updateRate('rate-1', { serviceLevel: 'EXPRESS' });

      // Once before and once after the change.
      expect(prisma.shippingZone.findMany).toHaveBeenCalledTimes(2);
    });

    it('only counts the rate the quote engine asks for', async () => {
      prisma.shippingZone.findMany.mockResolvedValue(COVERED(['ZP']));

      await service.deleteRate('rate-1');

      expect(prisma.shippingZone.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            rates: {
              some: expect.objectContaining({
                provider: 'INTERNAL',
                currency: 'NGN',
                serviceLevel: 'STANDARD',
              }),
            },
          }),
        }),
      );
    });

    it('takes the coverage lock before reading', async () => {
      prisma.shippingZone.findMany.mockResolvedValue(COVERED(['ZP']));

      await service.deleteRate('rate-1');
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('takes the lock even when acknowledged (it must wait for a guarded change), but skips the scans', async () => {
      await service.deleteRate('rate-1', { acknowledgeCoverageLoss: true });

      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(prisma.shippingZone.findMany).not.toHaveBeenCalled();
    });

    it('does not lock for a change that cannot affect coverage', async () => {
      await service.updateRate('rate-1', { flatFee: 2000 });
      await service.updateZone('z1', { name: 'Renamed' });

      expect(prisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('gives the transaction an explicit timeout and wait', async () => {
      await service.deleteRate('rate-1', { acknowledgeCoverageLoss: true });

      expect(prisma.$transaction).toHaveBeenCalledWith(
        expect.any(Function),
        expect.objectContaining({
          timeout: expect.any(Number),
          maxWait: expect.any(Number),
        }),
      );
    });

    it('reads the rate after the lock, so a stale read cannot overwrite a concurrent change', async () => {
      prisma.shippingZone.findMany.mockResolvedValue(COVERED(['ZP']));
      // The row another admin deactivated while this request waited.
      prisma.shippingRate.findUnique.mockResolvedValue({
        id: 'rate-1',
        zoneId: 'z1',
        provider: 'INTERNAL',
        serviceLevel: 'STANDARD',
        currency: 'NGN',
        flatFee: 1500,
        priority: 100,
        isActive: false,
        effectiveFrom: null,
        effectiveTo: null,
        minDeliveryDays: null,
        maxDeliveryDays: null,
      });

      await service.updateRate('rate-1', { serviceLevel: 'STANDARD' });

      expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.shippingRate.findUnique.mock.invocationCallOrder[0],
      );
      expect(prisma.shippingRate.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false }),
        }),
      );
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          before: expect.objectContaining({ isActive: false }),
        }),
      );
    });

    it('reads the rule after the lock too', async () => {
      prisma.shippingZone.findMany.mockResolvedValue(COVERED(['ZP']));
      prisma.geoState.findFirst = jest
        .fn()
        .mockResolvedValue({ code: 'ZP', name: 'Zed P', isActive: true });

      await service.updateRule('rule-1', { isActive: true });

      expect(prisma.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(
        prisma.shippingZoneRule.findUnique.mock.invocationCallOrder[0],
      );
    });

    it('uses one clock for both scans', async () => {
      prisma.shippingZone.findMany.mockResolvedValue(COVERED(['ZP']));

      await service.deleteRate('rate-1');

      const [first, second] = prisma.shippingZone.findMany.mock.calls.map(
        (call: unknown[]) =>
          JSON.stringify((call[0] as { where: unknown }).where),
      );
      expect(first).toBe(second);
    });

    it('writes the audit after the commit, outside the transaction', async () => {
      const order: string[] = [];
      prisma.$transaction.mockImplementation(
        async (cb: (tx: unknown) => unknown) => {
          const out = await cb(prisma);
          order.push('commit');
          return out;
        },
      );
      audit.log.mockImplementation(() => {
        order.push('audit');
        return Promise.resolve();
      });

      await service.deleteRate('rate-1', { acknowledgeCoverageLoss: true });

      expect(order).toEqual(['commit', 'audit']);
    });
  });
});
