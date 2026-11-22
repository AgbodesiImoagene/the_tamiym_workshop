import { formatInvoiceAmount, renderInvoicePdf } from './invoice-pdf';
import type { InvoicePdfInput } from './invoice-pdf';

function invoice(overrides: Partial<InvoicePdfInput> = {}): InvoicePdfInput {
  return {
    number: 'INV-000042',
    issuedAt: new Date('2026-11-22T10:00:00Z'),
    currency: 'NGN',
    sellerLegalName: 'Test Seller Ltd',
    sellerAddress: '1 Test Road, Lagos',
    sellerTaxNumber: 'TIN-1',
    buyerName: 'Ada Buyer',
    buyerAddress: '2 Buyer Street, Ikeja, Lagos, Nigeria',
    lines: [
      {
        description: 'Tee: Large',
        quantity: 2,
        unitPrice: '5000.00',
        lineTotal: '10000.00',
      },
    ],
    subtotalAmount: '10000.00',
    discountAmount: '0.00',
    shippingFee: '2000.00',
    vatRate: '0.0750',
    vatAmount: '837.21',
    roundingAdjustment: null,
    pricesIncludeVat: true,
    totalAmount: '12000.00',
    ...overrides,
  };
}

/** Count the pages of a PDF buffer. */
function pageCount(pdf: Buffer): number {
  return (pdf.toString('latin1').match(/\/Type \/Page\b(?!s)/g) ?? []).length;
}

describe('formatInvoiceAmount', () => {
  it.each([
    ['0', 'NGN 0.00'],
    ['999.5', 'NGN 999.50'],
    ['1234.5', 'NGN 1,234.50'],
    ['1234567.891', 'NGN 1,234,567.89'],
    ['-50', 'NGN -50.00'],
  ])('formats %s as %s', (value, expected) => {
    expect(formatInvoiceAmount('NGN', value)).toBe(expected);
  });
});

describe('renderInvoicePdf', () => {
  it('renders a one-page PDF', async () => {
    const pdf = await renderInvoicePdf(invoice());

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pageCount(pdf)).toBe(1);
  });

  it('renders the same bytes for the same invoice', async () => {
    const a = await renderInvoicePdf(invoice());
    const b = await renderInvoicePdf(invoice());

    expect(b.equals(a)).toBe(true);
  });

  it('renders the discount, rounding and VAT-exclusive variants without failing', async () => {
    const pdf = await renderInvoicePdf(
      invoice({
        discountAmount: '500.00',
        roundingAdjustment: '0.01',
        pricesIncludeVat: false,
      }),
    );

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });

  it('continues on a second page when there are many lines', async () => {
    const lines = Array.from({ length: 70 }, (_, i) => ({
      description: `Product ${i}: a long variant description that may wrap`,
      quantity: 1,
      unitPrice: '100.00',
      lineTotal: '100.00',
    }));

    const pdf = await renderInvoicePdf(invoice({ lines }));

    expect(pageCount(pdf)).toBeGreaterThan(1);
  });

  it('tolerates a stored lines value that is not a list', async () => {
    const pdf = await renderInvoicePdf(invoice({ lines: null }));

    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
