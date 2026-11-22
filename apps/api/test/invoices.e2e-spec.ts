import { INestApplication, NotFoundException } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { InvoicesService } from '../src/invoices/invoices.service';
import {
  CurrencyCode,
  OrderStatus,
  PaymentStatus,
  ProductStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';
import { ensureLga } from './utils/geo-fixtures';

const PASSWORD = 'TestPassword1!';
/** Rows are never cleaned up: a run id keeps emails, slugs and SKUs unique across runs. */
const RUN = Date.now().toString(36);
const SELLER = {
  invoiceSellerLegalName: 'Test Seller Ltd',
  invoiceSellerAddress: '1 Test Road, Ikeja, Lagos, Nigeria',
  invoiceSellerTaxNumber: 'TIN-0000000-0001',
};

/**
 * TTW-108: a paid order gets one VAT invoice, numbered without gaps, frozen
 * for good, readable by its owner and by admins only. Real Postgres, real
 * services.
 */
describe('VAT invoices (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let invoices: InvoicesService;
  let previousSettings: Awaited<
    ReturnType<PrismaService['siteSettings']['findUnique']>
  >;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    invoices = app.get(InvoicesService);
    previousSettings = await prisma.siteSettings.findUnique({
      where: { id: 'default' },
    });
    await setSeller(SELLER);
  });

  afterAll(async () => {
    if (!previousSettings) {
      // The suite created the singleton: leave the database as it was found.
      await prisma.siteSettings.deleteMany({ where: { id: 'default' } });
    } else {
      await prisma.siteSettings.update({
        where: { id: 'default' },
        data: {
          invoiceSellerLegalName: previousSettings.invoiceSellerLegalName,
          invoiceSellerAddress: previousSettings.invoiceSellerAddress,
          invoiceSellerTaxNumber: previousSettings.invoiceSellerTaxNumber,
        },
      });
    }
    await closeE2eApp(app);
  });

  async function setSeller(data: {
    invoiceSellerLegalName: string | null;
    invoiceSellerAddress: string | null;
    invoiceSellerTaxNumber: string | null;
  }) {
    await prisma.siteSettings.upsert({
      where: { id: 'default' },
      update: data,
      create: { id: 'default', vatRate: 0.075, ...data },
    });
  }

  async function createUser(label: string) {
    return prisma.user.create({
      data: {
        email: `${label}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Invoice',
        lastName: 'Buyer',
      },
    });
  }

  /** A paid order with one item, built directly from frozen snapshots. */
  async function createPaidOrder(
    suffix: string,
    overrides: {
      status?: OrderStatus;
      paymentStatus?: PaymentStatus;
      vatAmount?: number | null;
    } = {},
  ) {
    const user = await createUser(`inv-${RUN}-${suffix}`);
    const category = await prisma.category.create({
      data: {
        name: `Inv Cat ${RUN} ${suffix}`,
        slug: `inv-cat-${RUN}-${suffix}`,
      },
    });
    const product = await prisma.product.create({
      data: {
        name: `Inv Product ${RUN} ${suffix}`,
        slug: `inv-product-${RUN}-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Large',
        sku: `INV-${RUN}-${suffix}`,
      },
    });
    const address = await prisma.address.create({
      data: {
        userId: user.id,
        addressLine1: '2 Buyer Street',
        city: 'Ikeja',
        state: 'Lagos',
        stateCode: 'LA',
        lgaId: (await ensureLga(prisma)).id,
        countryCode: 'NG',
        country: 'Nigeria',
      },
    });
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        shippingAddressId: address.id,
        status: overrides.status ?? OrderStatus.PAID,
        paymentStatus: overrides.paymentStatus ?? PaymentStatus.SUCCEEDED,
        currency: CurrencyCode.NGN,
        subtotalAmount: 10000,
        shippingFee: 2000,
        discountAmount: 0,
        vatAmount:
          overrides.vatAmount === undefined ? 837.21 : overrides.vatAmount,
        vatRateSnapshot: 0.075,
        pricesIncludeVatSnapshot: true,
        vatAppliesToShippingSnapshot: true,
        totalAmount: 12000,
        shipRecipientName: 'Ada Buyer',
        shipLine1: '2 Buyer Street',
        shipCity: 'Ikeja',
        shipState: 'Lagos',
        shipCountry: 'Nigeria',
        items: {
          create: {
            productId: product.id,
            variantId: variant.id,
            quantity: 2,
            unitBasePrice: 5000,
            unitFinalPrice: 5000,
            productNameSnapshot: `Inv Product ${suffix}`,
            variantDisplaySnapshot: `Large (INV-${suffix})`,
            snapshotSource: 'PURCHASE',
          },
        },
      },
    });
    return { user, order, product };
  }

  it('issues a numbered invoice for a paid order and returns a PDF', async () => {
    const { user, order } = await createPaidOrder('first');

    const result = await invoices.getForCustomer(user.id, order.id);

    expect(result.invoice.number).toMatch(/^INV-\d{6}$/);
    expect(result.invoice.orderId).toBe(order.id);
    expect(result.pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(result.filename).toBe(`${result.invoice.number}.pdf`);
  });

  it('returns the same invoice on a second request and does not use a new number', async () => {
    const { user, order } = await createPaidOrder('twice');

    const a = await invoices.getForCustomer(user.id, order.id);
    const b = await invoices.getForCustomer(user.id, order.id);

    expect(b.invoice.id).toBe(a.invoice.id);
    expect(b.invoice.number).toBe(a.invoice.number);
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(
      1,
    );
  });

  it('numbers concurrent requests for different orders without a duplicate or a gap', async () => {
    const created = await Promise.all(
      ['c1', 'c2', 'c3', 'c4', 'c5', 'c6'].map((s) => createPaidOrder(s)),
    );

    const results = await Promise.all(
      created.map(({ user, order }) =>
        invoices.getForCustomer(user.id, order.id),
      ),
    );

    const sequences = results
      .map((r) => r.invoice.sequence)
      .sort((x, y) => x - y);
    expect(new Set(sequences).size).toBe(created.length);
    for (let i = 1; i < sequences.length; i += 1) {
      expect(sequences[i]).toBe(sequences[i - 1] + 1);
    }
  });

  it('gives one invoice, and burns one number, when the same order is requested concurrently', async () => {
    const { user, order } = await createPaidOrder('race');
    const before = await prisma.invoiceCounter.findUnique({
      where: { id: 'default' },
    });

    const results = await Promise.all(
      Array.from({ length: 5 }, () =>
        invoices.getForCustomer(user.id, order.id),
      ),
    );

    expect(new Set(results.map((r) => r.invoice.id)).size).toBe(1);
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(
      1,
    );
    // The requests that lost the race rolled their counter bump back: no gap.
    const after = await prisma.invoiceCounter.findUnique({
      where: { id: 'default' },
    });
    expect(after!.lastSequence).toBe((before?.lastSequence ?? 0) + 1);
  });

  it('refuses another customer with the same 404 as a missing order', async () => {
    const { order } = await createPaidOrder('owner');
    const stranger = await createUser(`inv-${RUN}-stranger`);

    await expect(
      invoices.getForCustomer(stranger.id, order.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      invoices.getForCustomer(stranger.id, 'does-not-exist'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(
      0,
    );
  });

  it('lets an admin read the invoice of any paid order', async () => {
    const { order } = await createPaidOrder('admin');

    const result = await invoices.getForAdmin(order.id);

    expect(result.invoice.orderId).toBe(order.id);
    expect(result.pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it.each([
    [
      'unpaid',
      {
        status: OrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.PENDING,
      },
    ],
    [
      'cancelled',
      { status: OrderStatus.CANCELLED, paymentStatus: PaymentStatus.PENDING },
    ],
    [
      'refunded',
      { status: OrderStatus.REFUNDED, paymentStatus: PaymentStatus.SUCCEEDED },
    ],
  ])('refuses to invoice a %s order', async (label, overrides) => {
    const { user, order } = await createPaidOrder(
      `ineligible-${label}`,
      overrides,
    );

    await expect(
      invoices.getForCustomer(user.id, order.id),
    ).rejects.toMatchObject({
      response: { code: 'INVOICE_ORDER_NOT_ELIGIBLE' },
    });
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(
      0,
    );
  });

  it('refuses a legacy order that has no VAT snapshot', async () => {
    const { user, order } = await createPaidOrder('legacy', {
      vatAmount: null,
    });

    await expect(
      invoices.getForCustomer(user.id, order.id),
    ).rejects.toMatchObject({
      response: { code: 'INVOICE_ORDER_NOT_ELIGIBLE' },
    });
  });

  it('refuses to issue while the seller details are missing, and burns no number', async () => {
    const { user, order } = await createPaidOrder('noseller');
    await setSeller({
      invoiceSellerLegalName: null,
      invoiceSellerAddress: null,
      invoiceSellerTaxNumber: null,
    });
    const before = await prisma.invoiceCounter.findUnique({
      where: { id: 'default' },
    });
    expect(before).not.toBeNull();
    try {
      await expect(
        invoices.getForCustomer(user.id, order.id),
      ).rejects.toMatchObject({
        response: { code: 'INVOICE_SELLER_DETAILS_MISSING' },
      });
    } finally {
      await setSeller(SELLER);
    }
    const after = await prisma.invoiceCounter.findUnique({
      where: { id: 'default' },
    });
    expect(after!.lastSequence).toBe(before!.lastSequence);
  });

  it('gives the number back when the insert fails after the counter moved', async () => {
    const { user, order } = await createPaidOrder('rollback');
    // Prime the counter row so "before" is a real value.
    const primer = await createPaidOrder('rollback-primer');
    await invoices.getForCustomer(primer.user.id, primer.order.id);
    const before = await prisma.invoiceCounter.findUnique({
      where: { id: 'default' },
    });
    let rawQueries = 0;
    const realTransaction = prisma.$transaction.bind(prisma) as (
      fn: (tx: Record<string, unknown>) => Promise<unknown>,
    ) => Promise<unknown>;
    const spy = jest.spyOn(prisma, '$transaction').mockImplementationOnce(((
      fn: (tx: Record<string, unknown>) => Promise<unknown>,
    ) =>
      realTransaction((tx) =>
        fn(
          new Proxy(tx, {
            get: (target, key) =>
              key === '$queryRaw'
                ? (...args: unknown[]) => {
                    rawQueries += 1;
                    return (target.$queryRaw as any)(...args);
                  }
                : key === 'invoice'
                  ? {
                      findUnique: (target.invoice as any).findUnique.bind(
                        target.invoice,
                      ),
                      create: () => Promise.reject(new Error('insert failed')),
                    }
                  : target[key as string],
          }),
        ),
      )) as never);
    try {
      await expect(invoices.getForCustomer(user.id, order.id)).rejects.toThrow(
        'insert failed',
      );
    } finally {
      spy.mockRestore();
    }

    // The order lock and the counter bump both ran before the insert failed.
    expect(rawQueries).toBe(2);
    const after = await prisma.invoiceCounter.findUnique({
      where: { id: 'default' },
    });
    expect(after!.lastSequence).toBe(before!.lastSequence);
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(
      0,
    );
    // The next issue takes the number the failed one gave back.
    const next = await invoices.getForCustomer(user.id, order.id);
    expect(next.invoice.sequence).toBe(before!.lastSequence + 1);
  });

  it('waits for a refund being written on the order, then refuses, and burns no number', async () => {
    const { user, order } = await createPaidOrder('refund-race');
    const primer = await createPaidOrder('refund-race-primer');
    await invoices.getForCustomer(primer.user.id, primer.order.id);
    const before = await prisma.invoiceCounter.findUnique({
      where: { id: 'default' },
    });

    // Transaction A writes a confirmed refund and holds it open.
    let release!: () => void;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let refundWritten!: () => void;
    const written = new Promise<void>((resolve) => {
      refundWritten = resolve;
    });
    const holder = prisma.$transaction(
      async (tx) => {
        await tx.refund.create({
          data: { orderId: order.id, amount: 5000, status: 'SUCCEEDED' },
        });
        refundWritten();
        await gate;
      },
      { timeout: 20000 },
    );
    await written;

    // The invoice request must wait for A, not slip in before it.
    let settled = false;
    const issuing = invoices
      .getForCustomer(user.id, order.id)
      .then(
        () => ({ ok: true as const }),
        (error: unknown) => ({ ok: false as const, error }),
      )
      .finally(() => {
        settled = true;
      });
    await new Promise((resolve) => setTimeout(resolve, 500));
    expect(settled).toBe(false);

    release();
    await holder;
    const result = await issuing;

    expect(result.ok).toBe(false);
    expect(
      (result as { error: { response: { code: string } } }).error.response.code,
    ).toBe('INVOICE_ORDER_NOT_ELIGIBLE');
    const after = await prisma.invoiceCounter.findUnique({
      where: { id: 'default' },
    });
    expect(after!.lastSequence).toBe(before!.lastSequence);
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(
      0,
    );
  });

  it('still invoices an order whose only refund failed', async () => {
    const { user, order } = await createPaidOrder('failed-refund');
    await prisma.refund.create({
      data: { orderId: order.id, amount: 5000, status: 'FAILED' },
    });

    const { invoice } = await invoices.getForCustomer(user.id, order.id);

    expect(invoice.orderId).toBe(order.id);
  });

  it('refuses an order that was partially refunded then moved back to PROCESSING', async () => {
    const { user, order } = await createPaidOrder('partial-refund', {
      status: OrderStatus.PROCESSING,
    });
    await prisma.refund.create({
      data: { orderId: order.id, amount: 5000, status: 'SUCCEEDED' },
    });

    await expect(
      invoices.getForCustomer(user.id, order.id),
    ).rejects.toMatchObject({
      response: { code: 'INVOICE_ORDER_NOT_ELIGIBLE' },
    });
    expect(await prisma.invoice.count({ where: { orderId: order.id } })).toBe(
      0,
    );
  });

  it('keeps an invoice unchanged when the seller settings and the product change', async () => {
    const { user, order, product } = await createPaidOrder('frozen');
    const first = await invoices.getForCustomer(user.id, order.id);

    await setSeller({
      invoiceSellerLegalName: 'Renamed Seller Ltd',
      invoiceSellerAddress: 'Somewhere else',
      invoiceSellerTaxNumber: 'TIN-9999999-0001',
    });
    await prisma.product.update({
      where: { id: product.id },
      data: { name: 'Renamed product' },
    });
    try {
      const again = await invoices.getForCustomer(user.id, order.id);
      expect(again.invoice.sellerLegalName).toBe(SELLER.invoiceSellerLegalName);
      expect(again.invoice.sellerTaxNumber).toBe(SELLER.invoiceSellerTaxNumber);
      expect(again.invoice.lines).toEqual(first.invoice.lines);
      expect(again.invoice.totalAmount.toString()).toBe(
        first.invoice.totalAmount.toString(),
      );
    } finally {
      await setSeller(SELLER);
    }
  });

  it('still serves an issued invoice after the order is refunded', async () => {
    const { user, order } = await createPaidOrder('later-refund');
    const first = await invoices.getForCustomer(user.id, order.id);
    await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.REFUNDED },
    });

    const again = await invoices.getForCustomer(user.id, order.id);

    expect(again.invoice.id).toBe(first.invoice.id);
  });

  it('refuses any update or delete of an issued invoice at the database', async () => {
    const { user, order } = await createPaidOrder('immutable');
    const { invoice } = await invoices.getForCustomer(user.id, order.id);

    await expect(
      prisma.invoice.update({
        where: { id: invoice.id },
        data: { totalAmount: 1 },
      }),
    ).rejects.toThrow(/immutable/i);
    await expect(
      prisma.invoice.delete({ where: { id: invoice.id } }),
    ).rejects.toThrow(/immutable/i);
    await expect(
      prisma.order.delete({ where: { id: order.id } }),
    ).rejects.toThrow();
  });

  it('records the VAT of the order on the invoice', async () => {
    const { user, order } = await createPaidOrder('vat');

    const { invoice } = await invoices.getForCustomer(user.id, order.id);

    expect(invoice.vatRate.toString()).toBe('0.075');
    expect(invoice.vatAmount.toString()).toBe('837.21');
    expect(invoice.totalAmount.toString()).toBe('12000');
    expect(invoice.sellerTaxNumber).toBe(SELLER.invoiceSellerTaxNumber);
    // Billed to the account holder (Invoice Buyer), not the shipping recipient (Ada Buyer).
    expect(invoice.buyerName).toBe('Invoice Buyer');
  });
});
