import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { AuditAction, CurrencyCode } from '../generated/prisma/enums';
import { ProductSurchargesService } from './product-surcharges.service';

/**
 * TTW-094: admin writes for OptionValueUpcharge and ProductViewPricing.
 * The database behaviour (unique indexes, concurrency) is covered by
 * test/admin-product-surcharges.e2e-spec.ts; these tests pin the ownership
 * checks, the idempotent write shape and the audit trail.
 */
describe('ProductSurchargesService', () => {
  const NGN = CurrencyCode.NGN;

  function build() {
    const prisma = {
      productOptionValue: { findFirst: jest.fn() },
      productView: { findFirst: jest.fn() },
      optionValueUpcharge: {
        findUnique: jest.fn(),
        findMany: jest.fn(),
        upsert: jest.fn(),
        deleteMany: jest.fn(),
      },
      productViewPricing: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        updateMany: jest.fn(),
        create: jest.fn(),
        deleteMany: jest.fn(),
      },
      product: { findUnique: jest.fn() },
    };
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const service = new ProductSurchargesService(
      prisma as never,
      audit as never,
    );
    return { prisma, audit, service };
  }

  const dec = (v: string) => new Prisma.Decimal(v);

  describe('setOptionValueUpcharge', () => {
    it('refuses a value that is not under this option and product', async () => {
      const { prisma, service } = build();
      prisma.productOptionValue.findFirst.mockResolvedValue(null);

      await expect(
        service.setOptionValueUpcharge('p1', 'o1', 'v1', NGN, 500),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.productOptionValue.findFirst).toHaveBeenCalledWith({
        where: { id: 'v1', optionId: 'o1', option: { productId: 'p1' } },
        select: { id: true },
      });
      expect(prisma.optionValueUpcharge.upsert).not.toHaveBeenCalled();
    });

    it('writes one row keyed by value and currency, and audits before/after', async () => {
      const { prisma, audit, service } = build();
      prisma.productOptionValue.findFirst.mockResolvedValue({ id: 'v1' });
      prisma.optionValueUpcharge.findUnique.mockResolvedValue({
        amount: dec('300.00'),
      });
      prisma.optionValueUpcharge.upsert.mockResolvedValue({
        optionValueId: 'v1',
        currency: NGN,
        amount: dec('500.00'),
      });

      const result = await service.setOptionValueUpcharge(
        'p1',
        'o1',
        'v1',
        NGN,
        500,
      );

      expect(prisma.optionValueUpcharge.upsert).toHaveBeenCalledWith({
        where: {
          optionValueId_currency: { optionValueId: 'v1', currency: NGN },
        },
        create: { optionValueId: 'v1', currency: NGN, amount: '500.00' },
        update: { amount: '500.00' },
      });
      expect(result).toEqual({
        optionId: 'o1',
        valueId: 'v1',
        currency: NGN,
        amount: '500.00',
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'catalog.option_value_upcharge.set',
          action: AuditAction.UPDATE,
          entityType: 'OptionValueUpcharge',
          entityId: 'v1',
          before: { currency: NGN, amount: '300.00' },
          after: { currency: NGN, amount: '500.00' },
        }),
      );
    });

    it('audits a first write as CREATE with no before value', async () => {
      const { prisma, audit, service } = build();
      prisma.productOptionValue.findFirst.mockResolvedValue({ id: 'v1' });
      prisma.optionValueUpcharge.findUnique.mockResolvedValue(null);
      prisma.optionValueUpcharge.upsert.mockResolvedValue({
        optionValueId: 'v1',
        currency: NGN,
        amount: dec('500.00'),
      });

      await service.setOptionValueUpcharge('p1', 'o1', 'v1', NGN, 500);

      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          action: AuditAction.CREATE,
          before: null,
        }),
      );
    });

    it('formats amounts to two decimals without floating point drift', async () => {
      const { prisma, service } = build();
      prisma.productOptionValue.findFirst.mockResolvedValue({ id: 'v1' });
      prisma.optionValueUpcharge.findUnique.mockResolvedValue(null);
      prisma.optionValueUpcharge.upsert.mockResolvedValue({
        optionValueId: 'v1',
        currency: NGN,
        amount: dec('0.30'),
      });

      await service.setOptionValueUpcharge('p1', 'o1', 'v1', NGN, 0.1 + 0.2);

      expect(prisma.optionValueUpcharge.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          update: { amount: '0.30' },
        }),
      );
    });
  });

  describe('deleteOptionValueUpcharge', () => {
    it('refuses a value outside this option and product', async () => {
      const { prisma, service } = build();
      prisma.productOptionValue.findFirst.mockResolvedValue(null);

      await expect(
        service.deleteOptionValueUpcharge('p1', 'o1', 'v1', NGN),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.optionValueUpcharge.deleteMany).not.toHaveBeenCalled();
    });

    it('is idempotent: an absent row succeeds and writes no audit entry', async () => {
      const { prisma, audit, service } = build();
      prisma.productOptionValue.findFirst.mockResolvedValue({ id: 'v1' });
      prisma.optionValueUpcharge.findUnique.mockResolvedValue(null);
      prisma.optionValueUpcharge.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.deleteOptionValueUpcharge('p1', 'o1', 'v1', NGN),
      ).resolves.toBeUndefined();
      expect(audit.log).not.toHaveBeenCalled();
    });

    it('deletes an existing row and audits the removed amount', async () => {
      const { prisma, audit, service } = build();
      prisma.productOptionValue.findFirst.mockResolvedValue({ id: 'v1' });
      prisma.optionValueUpcharge.findUnique.mockResolvedValue({
        amount: dec('500.00'),
      });
      prisma.optionValueUpcharge.deleteMany.mockResolvedValue({ count: 1 });

      await service.deleteOptionValueUpcharge('p1', 'o1', 'v1', NGN);

      expect(prisma.optionValueUpcharge.deleteMany).toHaveBeenCalledWith({
        where: { optionValueId: 'v1', currency: NGN },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'catalog.option_value_upcharge.delete',
          action: AuditAction.DELETE,
          before: { currency: NGN, amount: '500.00' },
          after: null,
        }),
      );
    });
  });

  describe('setViewSurcharge', () => {
    it('refuses a view that belongs to another product', async () => {
      const { prisma, service } = build();
      prisma.productView.findFirst.mockResolvedValue(null);

      await expect(
        service.setViewSurcharge('p1', 'view1', NGN, 1000),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.productView.findFirst).toHaveBeenCalledWith({
        where: { id: 'view1', productId: 'p1' },
        select: { id: true },
      });
    });

    it('updates the product-level row (no variant) when it exists', async () => {
      const { prisma, audit, service } = build();
      prisma.productView.findFirst.mockResolvedValue({ id: 'view1' });
      prisma.productViewPricing.findFirst.mockResolvedValue({
        surchargeAmount: dec('800.00'),
      });
      prisma.productViewPricing.updateMany.mockResolvedValue({ count: 1 });

      const result = await service.setViewSurcharge('p1', 'view1', NGN, 1000);

      expect(prisma.productViewPricing.updateMany).toHaveBeenCalledWith({
        where: {
          productId: 'p1',
          productViewId: 'view1',
          currency: NGN,
          variantId: null,
        },
        data: { surchargeAmount: '1000.00' },
      });
      expect(prisma.productViewPricing.create).not.toHaveBeenCalled();
      expect(result).toEqual({
        viewId: 'view1',
        currency: NGN,
        amount: '1000.00',
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'catalog.view_surcharge.set',
          action: AuditAction.UPDATE,
          entityType: 'ProductViewPricing',
          entityId: 'view1',
          before: { currency: NGN, amount: '800.00' },
          after: { currency: NGN, amount: '1000.00' },
        }),
      );
    });

    it('creates the product-level row when none exists', async () => {
      const { prisma, audit, service } = build();
      prisma.productView.findFirst.mockResolvedValue({ id: 'view1' });
      prisma.productViewPricing.findFirst.mockResolvedValue(null);
      prisma.productViewPricing.updateMany.mockResolvedValue({ count: 0 });
      prisma.productViewPricing.create.mockResolvedValue({});

      await service.setViewSurcharge('p1', 'view1', NGN, 1000);

      expect(prisma.productViewPricing.create).toHaveBeenCalledWith({
        data: {
          productId: 'p1',
          productViewId: 'view1',
          variantId: null,
          currency: NGN,
          surchargeAmount: '1000.00',
        },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({ action: AuditAction.CREATE, before: null }),
      );
    });

    it('falls back to an update when a concurrent create wins the unique index', async () => {
      const { prisma, service } = build();
      prisma.productView.findFirst.mockResolvedValue({ id: 'view1' });
      prisma.productViewPricing.findFirst.mockResolvedValue(null);
      prisma.productViewPricing.updateMany
        .mockResolvedValueOnce({ count: 0 })
        .mockResolvedValueOnce({ count: 1 });
      prisma.productViewPricing.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('unique', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      const result = await service.setViewSurcharge('p1', 'view1', NGN, 1000);

      expect(prisma.productViewPricing.updateMany).toHaveBeenCalledTimes(2);
      expect(result.amount).toBe('1000.00');
    });

    it('rethrows any other database error', async () => {
      const { prisma, service } = build();
      prisma.productView.findFirst.mockResolvedValue({ id: 'view1' });
      prisma.productViewPricing.findFirst.mockResolvedValue(null);
      prisma.productViewPricing.updateMany.mockResolvedValue({ count: 0 });
      prisma.productViewPricing.create.mockRejectedValue(new Error('boom'));

      await expect(
        service.setViewSurcharge('p1', 'view1', NGN, 1000),
      ).rejects.toThrow('boom');
    });
  });

  describe('deleteViewSurcharge', () => {
    it('only removes the product-level row, never a variant override', async () => {
      const { prisma, audit, service } = build();
      prisma.productView.findFirst.mockResolvedValue({ id: 'view1' });
      prisma.productViewPricing.findFirst.mockResolvedValue({
        surchargeAmount: dec('1000.00'),
      });
      prisma.productViewPricing.deleteMany.mockResolvedValue({ count: 1 });

      await service.deleteViewSurcharge('p1', 'view1', NGN);

      expect(prisma.productViewPricing.deleteMany).toHaveBeenCalledWith({
        where: {
          productId: 'p1',
          productViewId: 'view1',
          currency: NGN,
          variantId: null,
        },
      });
      expect(audit.log).toHaveBeenCalledWith(
        expect.objectContaining({
          eventName: 'catalog.view_surcharge.delete',
          action: AuditAction.DELETE,
        }),
      );
    });

    it('is idempotent when there is nothing to delete', async () => {
      const { prisma, audit, service } = build();
      prisma.productView.findFirst.mockResolvedValue({ id: 'view1' });
      prisma.productViewPricing.findFirst.mockResolvedValue(null);
      prisma.productViewPricing.deleteMany.mockResolvedValue({ count: 0 });

      await expect(
        service.deleteViewSurcharge('p1', 'view1', NGN),
      ).resolves.toBeUndefined();
      expect(audit.log).not.toHaveBeenCalled();
    });
  });

  describe('listForProduct', () => {
    it('returns explicit DTOs with string amounts, never raw rows', async () => {
      const { prisma, service } = build();
      prisma.product.findUnique.mockResolvedValue({ id: 'p1' });
      prisma.optionValueUpcharge.findMany.mockResolvedValue([
        {
          id: 'row1',
          optionValueId: 'v1',
          currency: NGN,
          amount: dec('500'),
          createdAt: new Date(),
          updatedAt: new Date(),
          optionValue: { optionId: 'o1' },
        },
      ]);
      prisma.productViewPricing.findMany.mockResolvedValue([
        {
          id: 'row2',
          productViewId: 'view1',
          currency: NGN,
          surchargeAmount: dec('1000'),
          variantId: null,
        },
      ]);

      const result = await service.listForProduct('p1');

      expect(result).toEqual({
        optionValueUpcharges: [
          { optionId: 'o1', valueId: 'v1', currency: NGN, amount: '500.00' },
        ],
        viewSurcharges: [{ viewId: 'view1', currency: NGN, amount: '1000.00' }],
      });
    });

    it('refuses an unknown product', async () => {
      const { prisma, service } = build();
      prisma.product.findUnique.mockResolvedValue(null);
      await expect(service.listForProduct('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
