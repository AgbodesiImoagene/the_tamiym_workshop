import { BadRequestException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { ShippingAdminService } from './shipping-admin.service';

/**
 * TTW-098: an admin can give a rate weight or quantity brackets on top of its
 * flat fee. A rate without them behaves exactly as before.
 */
describe('ShippingAdminService - rate brackets (TTW-098)', () => {
  let service: ShippingAdminService;
  let audit: { log: jest.Mock };
  let prisma: {
    shippingZone: { findUnique: jest.Mock; findMany: jest.Mock };
    shippingRate: {
      create: jest.Mock;
      findUnique: jest.Mock;
      findMany: jest.Mock;
      update: jest.Mock;
    };
    $transaction: jest.Mock;
    $executeRaw: jest.Mock;
  };

  const EXISTING = {
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
    bracketBasis: 'QUANTITY',
    brackets: [{ minValue: 10, fee: 4000 }],
  };

  beforeEach(async () => {
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    prisma = {
      shippingZone: {
        findUnique: jest.fn().mockResolvedValue({ id: 'z1' }),
        findMany: jest.fn().mockResolvedValue([]),
      },
      shippingRate: {
        create: jest
          .fn()
          .mockImplementation(({ data }) => ({ id: 'rate-new', ...data })),
        findUnique: jest.fn().mockResolvedValue(EXISTING),
        findMany: jest.fn().mockResolvedValue([]),
        // The result of an update is a row, not the write instructions.
        update: jest
          .fn()
          .mockImplementation(({ data }: { data: Record<string, unknown> }) => {
            const columns = { ...data };
            delete columns.brackets;
            return { ...EXISTING, ...columns };
          }),
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

  describe('createRate', () => {
    it('keeps a plain flat rate without basis or brackets', async () => {
      await service.createRate('z1', { flatFee: 1500 });

      const { data } = prisma.shippingRate.create.mock.calls[0][0];
      expect(data.bracketBasis).toBeNull();
      expect(data.brackets).toBeUndefined();
    });

    it('stores the basis and its brackets, whatever the order they come in', async () => {
      await service.createRate('z1', {
        flatFee: 1500,
        bracketBasis: 'QUANTITY',
        brackets: [
          { minValue: 50, fee: 9000 },
          { minValue: 10, fee: 4000 },
        ],
      });

      const { data } = prisma.shippingRate.create.mock.calls[0][0];
      expect(data.bracketBasis).toBe('QUANTITY');
      expect(data.brackets).toEqual({
        create: [
          { minValue: 10, fee: 4000 },
          { minValue: 50, fee: 9000 },
        ],
      });
    });

    it.each([
      ['brackets without a basis', { brackets: [{ minValue: 10, fee: 4000 }] }],
      ['a basis without brackets', { bracketBasis: 'QUANTITY', brackets: [] }],
      [
        'two brackets with the same minimum',
        {
          bracketBasis: 'QUANTITY',
          brackets: [
            { minValue: 10, fee: 4000 },
            { minValue: 10, fee: 5000 },
          ],
        },
      ],
      [
        'a minimum of zero (that is the flat fee)',
        { bracketBasis: 'QUANTITY', brackets: [{ minValue: 0, fee: 4000 }] },
      ],
      [
        'a fractional minimum',
        { bracketBasis: 'WEIGHT_GRAMS', brackets: [{ minValue: 2.5, fee: 1 }] },
      ],
      [
        'a negative fee',
        { bracketBasis: 'QUANTITY', brackets: [{ minValue: 10, fee: -1 }] },
      ],
    ])('refuses %s and writes nothing', async (_label, extra) => {
      await expect(
        service.createRate('z1', { flatFee: 1500, ...extra } as never),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.shippingRate.create).not.toHaveBeenCalled();
    });
  });

  describe('updateRate', () => {
    it('replaces the brackets when new ones are sent, and audits before and after', async () => {
      await service.updateRate('rate-1', {
        brackets: [{ minValue: 20, fee: 6000 }],
      });

      const { data } = prisma.shippingRate.update.mock.calls[0][0];
      expect(data.bracketBasis).toBe('QUANTITY');
      expect(data.brackets).toEqual({
        deleteMany: {},
        create: [{ minValue: 20, fee: 6000 }],
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'shipping.rate.updated',
          before: expect.objectContaining({
            bracketBasis: 'QUANTITY',
            brackets: [{ minValue: 10, fee: 4000 }],
          }),
        }),
      );
    });

    it('leaves the brackets alone when the update does not mention them', async () => {
      await service.updateRate('rate-1', { flatFee: 2000 });

      const { data } = prisma.shippingRate.update.mock.calls[0][0];
      expect(data.brackets).toBeUndefined();
      expect(data.bracketBasis).toBeUndefined();
    });

    it('clears every bracket when the basis is set to null (back to a flat rate)', async () => {
      await service.updateRate('rate-1', { bracketBasis: null });

      const { data } = prisma.shippingRate.update.mock.calls[0][0];
      expect(data.bracketBasis).toBeNull();
      expect(data.brackets).toEqual({ deleteMany: {} });
    });

    it('keeps the existing brackets when the basis is sent again unchanged', async () => {
      await service.updateRate('rate-1', { bracketBasis: 'QUANTITY' });

      const { data } = prisma.shippingRate.update.mock.calls[0][0];
      expect(data.bracketBasis).toBe('QUANTITY');
      expect(data.brackets).toBeUndefined();
    });

    it('refuses a new basis without new brackets, since the old minimums are in another unit', async () => {
      await expect(
        service.updateRate('rate-1', { bracketBasis: 'WEIGHT_GRAMS' }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.shippingRate.update).not.toHaveBeenCalled();
    });

    it('refuses invalid brackets and writes nothing', async () => {
      await expect(
        service.updateRate('rate-1', {
          brackets: [
            { minValue: 5, fee: 1 },
            { minValue: 5, fee: 2 },
          ],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.shippingRate.update).not.toHaveBeenCalled();
    });
  });
});
