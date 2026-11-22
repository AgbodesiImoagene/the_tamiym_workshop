import { NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { InvoicesService } from './invoices.service';

const SETTINGS = {
  invoiceSellerLegalName: 'Test Seller Ltd',
  invoiceSellerAddress: '1 Test Road, Lagos',
  invoiceSellerTaxNumber: 'TIN-1',
};

function paidOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: 'order-1',
    userId: 'user-1',
    status: 'PAID',
    paymentStatus: 'SUCCEEDED',
    currency: 'NGN',
    subtotalAmount: new Prisma.Decimal('10000.00'),
    discountAmount: new Prisma.Decimal('0'),
    shippingFee: new Prisma.Decimal('2000.00'),
    vatAmount: new Prisma.Decimal('837.21'),
    vatRateSnapshot: new Prisma.Decimal('0.075'),
    pricesIncludeVatSnapshot: true,
    roundingAdjustment: null,
    totalAmount: new Prisma.Decimal('12000.00'),
    shipRecipientName: 'Ada Buyer',
    shipLine1: '2 Buyer Street',
    shipLine2: null,
    shipCity: 'Ikeja',
    shipState: 'Lagos',
    shipPostalCode: null,
    shipCountry: 'Nigeria',
    user: { firstName: 'Ada', lastName: 'Lovelace' },
    refunds: [],
    items: [
      {
        quantity: 2,
        unitFinalPrice: new Prisma.Decimal('5000.00'),
        unitDiscountAmount: new Prisma.Decimal('0'),
        productNameSnapshot: 'Tee',
        variantDisplaySnapshot: 'Large',
      },
    ],
    ...overrides,
  };
}

function storedInvoice(overrides: Record<string, unknown> = {}) {
  return {
    id: 'inv-1',
    orderId: 'order-1',
    sequence: 7,
    number: 'INV-000007',
    issuedAt: new Date('2026-11-22T10:00:00Z'),
    currency: 'NGN',
    sellerLegalName: 'Test Seller Ltd',
    sellerAddress: '1 Test Road, Lagos',
    sellerTaxNumber: 'TIN-1',
    buyerName: 'Ada Lovelace',
    buyerAddress: '2 Buyer Street, Ikeja',
    lines: [
      {
        description: 'Tee: Large',
        quantity: 2,
        unitPrice: '5000.00',
        lineTotal: '10000.00',
      },
    ],
    subtotalAmount: new Prisma.Decimal('10000.00'),
    discountAmount: new Prisma.Decimal('0'),
    shippingFee: new Prisma.Decimal('2000.00'),
    vatRate: new Prisma.Decimal('0.075'),
    vatAmount: new Prisma.Decimal('837.21'),
    roundingAdjustment: null,
    pricesIncludeVat: true,
    totalAmount: new Prisma.Decimal('12000.00'),
    ...overrides,
  };
}

describe('InvoicesService', () => {
  const tx = {
    order: { findUnique: jest.fn() },
    siteSettings: { findUnique: jest.fn() },
    $queryRaw: jest.fn(),
    invoice: { findUnique: jest.fn(), create: jest.fn() },
  };
  const prisma = {
    order: { findFirst: jest.fn(), findUnique: jest.fn() },
    invoice: { findUnique: jest.fn() },
    $transaction: jest.fn(),
  };
  let service: InvoicesService;

  beforeEach(() => {
    jest.resetAllMocks();
    prisma.$transaction.mockImplementation((fn: (t: typeof tx) => unknown) =>
      fn(tx),
    );
    tx.order.findUnique.mockResolvedValue(paidOrder());
    tx.invoice.findUnique.mockResolvedValue(null);
    tx.siteSettings.findUnique.mockResolvedValue(SETTINGS);
    // First call locks the order row, second takes the next number.
    tx.$queryRaw
      .mockResolvedValueOnce([{ id: 'order-1' }])
      .mockResolvedValue([{ lastSequence: 7 }]);
    tx.invoice.create.mockImplementation(
      ({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve(storedInvoice(data)),
    );
    service = new InvoicesService(prisma as never);
  });

  describe('issueForOrder', () => {
    it('returns the existing invoice without touching the counter', async () => {
      prisma.invoice.findUnique.mockResolvedValue(storedInvoice());

      const invoice = await service.issueForOrder('order-1');

      expect(invoice.number).toBe('INV-000007');
      expect(prisma.order.findUnique).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('answers 404 for a missing order', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);
      tx.order.findUnique.mockResolvedValue(null);

      await expect(service.issueForOrder('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1); // the lock, never the counter
    });

    it('locks the order row, then numbers the invoice and bills the account holder', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);

      const invoice = await service.issueForOrder('order-1');

      expect(invoice.number).toBe('INV-000007');
      expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
      expect(tx.$queryRaw.mock.calls[0][0].join('')).toMatch(/FOR UPDATE/);
      const data = tx.invoice.create.mock.calls[0][0].data as Record<
        string,
        unknown
      >;
      expect(data).toMatchObject({
        orderId: 'order-1',
        sequence: 7,
        number: 'INV-000007',
        buyerName: 'Ada Lovelace',
        sellerTaxNumber: 'TIN-1',
        totalAmount: '12000.00',
        vatRate: '0.0750',
      });
    });

    it('returns the invoice found once the order is locked, without a new number', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);
      tx.invoice.findUnique.mockResolvedValue(
        storedInvoice({ id: 'inv-late' }),
      );

      const invoice = await service.issueForOrder('order-1');

      expect(invoice.id).toBe('inv-late');
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tx.invoice.create).not.toHaveBeenCalled();
    });

    it('re-checks eligibility under the lock: a refund that landed since the first read stops the issue', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);
      tx.order.findUnique.mockResolvedValue(
        paidOrder({ status: 'PROCESSING', refunds: [{ status: 'SUCCEEDED' }] }),
      );

      await expect(service.issueForOrder('order-1')).rejects.toMatchObject({
        response: { code: 'INVOICE_ORDER_NOT_ELIGIBLE' },
      });
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tx.invoice.create).not.toHaveBeenCalled();
    });

    it('refuses an unpaid order', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);
      tx.order.findUnique.mockResolvedValue(
        paidOrder({ status: 'PENDING_PAYMENT', paymentStatus: 'PENDING' }),
      );

      await expect(service.issueForOrder('order-1')).rejects.toMatchObject({
        response: { code: 'INVOICE_ORDER_NOT_ELIGIBLE' },
      });
      expect(tx.invoice.create).not.toHaveBeenCalled();
    });

    it('reads the seller details inside the transaction and refuses without them', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);
      tx.siteSettings.findUnique.mockResolvedValue({
        ...SETTINGS,
        invoiceSellerTaxNumber: null,
      });

      await expect(service.issueForOrder('order-1')).rejects.toMatchObject({
        response: { code: 'INVOICE_SELLER_DETAILS_MISSING' },
      });
      // Nothing was numbered: only the lock ran.
      expect(tx.$queryRaw).toHaveBeenCalledTimes(1);
      expect(tx.invoice.create).not.toHaveBeenCalled();
    });

    it("returns the winner's invoice when another request issued it first", async () => {
      const winner = storedInvoice({ id: 'inv-winner' });
      prisma.invoice.findUnique
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(winner);
      tx.invoice.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      const invoice = await service.issueForOrder('order-1');

      expect(invoice.id).toBe('inv-winner');
    });

    it('rethrows a unique violation when no invoice exists for the order', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);
      tx.invoice.create.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expect(service.issueForOrder('order-1')).rejects.toBeInstanceOf(
        Prisma.PrismaClientKnownRequestError,
      );
    });

    it('rethrows any other database error', async () => {
      prisma.invoice.findUnique.mockResolvedValue(null);
      tx.invoice.create.mockRejectedValue(new Error('connection lost'));

      await expect(service.issueForOrder('order-1')).rejects.toThrow(
        'connection lost',
      );
    });
  });

  describe('downloads', () => {
    it('serves the owner a PDF named after the invoice number', async () => {
      prisma.order.findFirst.mockResolvedValue({ id: 'order-1' });
      prisma.invoice.findUnique.mockResolvedValue(storedInvoice());

      const file = await service.getForCustomer('user-1', 'order-1');

      expect(prisma.order.findFirst).toHaveBeenCalledWith({
        where: { id: 'order-1', userId: 'user-1' },
        select: { id: true },
      });
      expect(file.filename).toBe('INV-000007.pdf');
      expect(file.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    });

    it("answers 404 for someone else's order, and issues nothing", async () => {
      prisma.order.findFirst.mockResolvedValue(null);

      await expect(
        service.getForCustomer('user-2', 'order-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.invoice.findUnique).not.toHaveBeenCalled();
    });

    it('serves an admin by order id', async () => {
      prisma.order.findUnique.mockResolvedValue({ id: 'order-1' });
      prisma.invoice.findUnique.mockResolvedValue(storedInvoice());

      const file = await service.getForAdmin('order-1');

      expect(file.invoice.number).toBe('INV-000007');
    });

    it('answers an admin 404 for a missing order', async () => {
      prisma.order.findUnique.mockResolvedValue(null);

      await expect(service.getForAdmin('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
