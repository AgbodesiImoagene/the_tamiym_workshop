import {
  assertOrderInvoiceable,
  assertSellerDetails,
  buildInvoiceSnapshot,
  type InvoiceOrderInput,
} from './invoice-snapshot';

const SELLER = {
  invoiceSellerLegalName: 'Test Seller Ltd',
  invoiceSellerAddress: '1 Test Road, Lagos',
  invoiceSellerTaxNumber: 'TIN-1',
};

function order(overrides: Partial<InvoiceOrderInput> = {}): InvoiceOrderInput {
  return {
    id: 'order-1',
    status: 'PAID',
    paymentStatus: 'SUCCEEDED',
    currency: 'NGN',
    subtotalAmount: '10000.00',
    discountAmount: '0.00',
    shippingFee: '2000.00',
    vatAmount: '837.21',
    vatRateSnapshot: '0.0750',
    pricesIncludeVatSnapshot: true,
    roundingAdjustment: null,
    totalAmount: '12000.00',
    buyerName: null,
    refunds: [],
    shipRecipientName: 'Ada Buyer',
    shipLine1: '2 Buyer Street',
    shipLine2: null,
    shipCity: 'Ikeja',
    shipState: 'Lagos',
    shipPostalCode: null,
    shipCountry: 'Nigeria',
    items: [
      {
        quantity: 2,
        unitFinalPrice: '5000.00',
        unitDiscountAmount: '0.00',
        productNameSnapshot: 'Tee',
        variantDisplaySnapshot: 'Large (SKU-1)',
      },
    ],
    ...overrides,
  };
}

describe('assertOrderInvoiceable', () => {
  it.each(['PAID', 'PROCESSING', 'FULFILLED', 'DELIVERED'])(
    'accepts a paid order in status %s',
    (status) => {
      expect(() => assertOrderInvoiceable(order({ status }))).not.toThrow();
    },
  );

  it.each([
    ['PENDING_PAYMENT', 'PENDING'],
    ['CANCELLED', 'PENDING'],
    ['REFUNDED', 'SUCCEEDED'],
    ['PARTIALLY_REFUNDED', 'SUCCEEDED'],
    ['PAID', 'FAILED'],
  ])('refuses status %s with payment %s', (status, paymentStatus) => {
    expect(() =>
      assertOrderInvoiceable(order({ status, paymentStatus })),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'INVOICE_ORDER_NOT_ELIGIBLE',
        }),
      }),
    );
  });

  it.each(['SUCCEEDED', 'PROCESSING', 'INITIATED', 'NEEDS_ATTENTION'])(
    'refuses a paid order that has a %s refund, even when its status went back to PROCESSING',
    (status) => {
      expect(() =>
        assertOrderInvoiceable(
          order({ status: 'PROCESSING', refunds: [{ status }] }),
        ),
      ).toThrow(
        expect.objectContaining({
          response: expect.objectContaining({
            code: 'INVOICE_ORDER_NOT_ELIGIBLE',
          }),
        }),
      );
    },
  );

  it('accepts an order whose only refund failed', () => {
    expect(() =>
      assertOrderInvoiceable(order({ refunds: [{ status: 'FAILED' }] })),
    ).not.toThrow();
  });

  it('refuses a legacy order without a VAT snapshot', () => {
    expect(() =>
      assertOrderInvoiceable(order({ vatAmount: null, vatRateSnapshot: null })),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'INVOICE_ORDER_NOT_ELIGIBLE',
        }),
      }),
    );
  });
});

describe('assertSellerDetails', () => {
  it('accepts complete details and trims them', () => {
    expect(
      assertSellerDetails({
        ...SELLER,
        invoiceSellerLegalName: '  Test Seller Ltd ',
      }),
    ).toEqual({
      legalName: 'Test Seller Ltd',
      address: '1 Test Road, Lagos',
      taxNumber: 'TIN-1',
    });
  });

  it.each([
    [null],
    [{ ...SELLER, invoiceSellerLegalName: null }],
    [{ ...SELLER, invoiceSellerAddress: '   ' }],
    [{ ...SELLER, invoiceSellerTaxNumber: '' }],
  ])('refuses missing details %#', (settings) => {
    expect(() => assertSellerDetails(settings)).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'INVOICE_SELLER_DETAILS_MISSING',
        }),
      }),
    );
  });
});

describe('buildInvoiceSnapshot', () => {
  it('copies amounts, VAT, buyer and lines from the order', () => {
    const snap = buildInvoiceSnapshot(order(), {
      legalName: 'Test Seller Ltd',
      address: '1 Test Road, Lagos',
      taxNumber: 'TIN-1',
    });

    expect(snap.seller.taxNumber).toBe('TIN-1');
    expect(snap.buyerName).toBe('Ada Buyer');
    expect(snap.buyerAddress).toBe('2 Buyer Street, Ikeja, Lagos, Nigeria');
    expect(snap.lines).toEqual([
      {
        description: 'Tee: Large (SKU-1)',
        quantity: 2,
        unitPrice: '5000.00',
        lineTotal: '10000.00',
      },
    ]);
    expect(snap.vatRate).toBe('0.0750');
    expect(snap.vatAmount).toBe('837.21');
    expect(snap.totalAmount).toBe('12000.00');
    expect(snap.pricesIncludeVat).toBe(true);
  });

  it('computes line totals in exact decimals', () => {
    const snap = buildInvoiceSnapshot(
      order({
        subtotalAmount: '0.30',
        items: [
          {
            quantity: 3,
            unitFinalPrice: '0.10',
            unitDiscountAmount: '0.00',
            productNameSnapshot: 'A',
            variantDisplaySnapshot: 'B',
          },
        ],
      }),
      { legalName: 'S', address: 'A', taxNumber: 'T' },
    );

    expect(snap.lines[0].lineTotal).toBe('0.30');
  });

  it('prints lines before the unit discount, so lines add up to the subtotal', () => {
    // 2 x (4500 paid + 500 discount): subtotal 10000 is pre-discount, discount 1000.
    const snap = buildInvoiceSnapshot(
      order({
        subtotalAmount: '10000.00',
        discountAmount: '1000.00',
        shippingFee: '0.00',
        totalAmount: '9000.00',
        items: [
          {
            quantity: 2,
            unitFinalPrice: '4500.00',
            unitDiscountAmount: '500.00',
            productNameSnapshot: 'Tee',
            variantDisplaySnapshot: 'L',
          },
        ],
      }),
      { legalName: 'S', address: 'A', taxNumber: 'T' },
    );

    expect(snap.lines[0]).toMatchObject({
      unitPrice: '5000.00',
      lineTotal: '10000.00',
    });
    expect(snap.subtotalAmount).toBe('10000.00');
    expect(snap.discountAmount).toBe('1000.00');
  });

  it('refuses an order whose lines do not add up to its subtotal', () => {
    expect(() =>
      buildInvoiceSnapshot(order({ subtotalAmount: '9999.00' }), {
        legalName: 'S',
        address: 'A',
        taxNumber: 'T',
      }),
    ).toThrow(
      expect.objectContaining({
        response: expect.objectContaining({
          code: 'INVOICE_ORDER_TOTALS_MISMATCH',
        }),
      }),
    );
  });

  it('bills the account holder, falling back to the shipping recipient', () => {
    const seller = { legalName: 'S', address: 'A', taxNumber: 'T' };

    expect(
      buildInvoiceSnapshot(order({ buyerName: 'Grace Hopper' }), seller)
        .buyerName,
    ).toBe('Grace Hopper');
    expect(
      buildInvoiceSnapshot(order({ buyerName: null }), seller).buyerName,
    ).toBe('Ada Buyer');
    expect(
      buildInvoiceSnapshot(
        order({ buyerName: null, shipRecipientName: null }),
        seller,
      ).buyerName,
    ).toBe('Customer');
  });
});
