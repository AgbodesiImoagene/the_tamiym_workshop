import PDFDocument from 'pdfkit';
import { Prisma } from '../generated/prisma/client';
import type { InvoiceLine, Money } from './invoice-snapshot';

/** The stored invoice, as the PDF reads it. Nothing else is looked up. */
export interface InvoicePdfInput {
  number: string;
  issuedAt: Date;
  currency: string;
  sellerLegalName: string;
  sellerAddress: string;
  sellerTaxNumber: string;
  buyerName: string;
  buyerAddress: string;
  lines: unknown;
  subtotalAmount: Money;
  discountAmount: Money;
  shippingFee: Money;
  vatRate: Money;
  vatAmount: Money;
  roundingAdjustment: Money | null;
  pricesIncludeVat: boolean;
  totalAmount: Money;
}

/** Amounts read `NGN 1,234.50`: the built-in PDF font has no naira sign. */
export function formatInvoiceAmount(currency: string, value: Money): string {
  const fixed = new Prisma.Decimal(value).toFixed(2);
  const [whole, cents] = fixed.split('.');
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${currency} ${grouped}.${cents}`;
}

function percent(rate: Money): string {
  return `${new Prisma.Decimal(rate).times(100).toDecimalPlaces(2).toString()}%`;
}

function readLines(raw: unknown): InvoiceLine[] {
  return Array.isArray(raw) ? (raw as InvoiceLine[]) : [];
}

/** Draw an invoice as a one-or-more page A4 PDF. Text is always drawn as plain strings. */
export function renderInvoicePdf(invoice: InvoicePdfInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 50,
      info: {
        Title: `Invoice ${invoice.number}`,
        Producer: 'Tamiym Workshop',
        // The issue date, not the clock: the same invoice always renders to the same bytes.
        CreationDate: invoice.issuedAt,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const money = (value: Money) =>
      formatInvoiceAmount(invoice.currency, value);
    const left = 50;
    const right = 545;

    doc.font('Helvetica-Bold').fontSize(22).text('Tax invoice', left, 50);
    doc
      .font('Helvetica')
      .fontSize(10)
      .text(`Invoice number: ${invoice.number}`, left, 84)
      .text(`Date of issue: ${invoice.issuedAt.toISOString().slice(0, 10)}`);

    doc.font('Helvetica-Bold').fontSize(10).text('Seller', left, 126);
    doc
      .font('Helvetica')
      .text(invoice.sellerLegalName)
      .text(invoice.sellerAddress, { width: 230 })
      .text(`Tax number: ${invoice.sellerTaxNumber}`);

    doc.font('Helvetica-Bold').text('Billed to', 315, 126);
    doc
      .font('Helvetica')
      .text(invoice.buyerName, 315)
      .text(invoice.buyerAddress, 315, undefined, { width: 230 });

    let y = Math.max(doc.y, 210) + 20;
    doc.font('Helvetica-Bold').fontSize(9);
    doc.text('Description', left, y, { width: 250 });
    doc.text('Qty', 310, y, { width: 40, align: 'right' });
    doc.text('Unit price', 355, y, { width: 90, align: 'right' });
    doc.text('Amount', 450, y, { width: 95, align: 'right' });
    y += 16;
    doc.moveTo(left, y).lineTo(right, y).stroke();
    y += 6;

    doc.font('Helvetica').fontSize(9);
    for (const line of readLines(invoice.lines)) {
      const height = doc.heightOfString(line.description, { width: 250 });
      if (y + height > 740) {
        doc.addPage();
        y = 50;
      }
      doc.text(line.description, left, y, { width: 250 });
      doc.text(String(line.quantity), 310, y, { width: 40, align: 'right' });
      doc.text(money(line.unitPrice), 355, y, { width: 90, align: 'right' });
      doc.text(money(line.lineTotal), 450, y, { width: 95, align: 'right' });
      y += Math.max(height, 12) + 6;
    }

    if (y > 640) {
      doc.addPage();
      y = 50;
    }
    doc.moveTo(left, y).lineTo(right, y).stroke();
    y += 10;

    const totals: Array<[string, string, boolean]> = [
      ['Subtotal', money(invoice.subtotalAmount), false],
    ];
    if (!new Prisma.Decimal(invoice.discountAmount).isZero()) {
      totals.push(['Discount', `- ${money(invoice.discountAmount)}`, false]);
    }
    totals.push(['Shipping', money(invoice.shippingFee), false]);
    if (
      invoice.roundingAdjustment != null &&
      !new Prisma.Decimal(invoice.roundingAdjustment).isZero()
    ) {
      totals.push(['Rounding', money(invoice.roundingAdjustment), false]);
    }
    totals.push([
      invoice.pricesIncludeVat
        ? `VAT ${percent(invoice.vatRate)} (included in prices)`
        : `VAT ${percent(invoice.vatRate)}`,
      money(invoice.vatAmount),
      false,
    ]);
    totals.push(['Total', money(invoice.totalAmount), true]);

    for (const [label, value, bold] of totals) {
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(bold ? 11 : 9);
      doc.text(label, 250, y, { width: 190 });
      doc.text(value, 440, y, { width: 105, align: 'right' });
      y += bold ? 18 : 14;
    }

    doc
      .font('Helvetica')
      .fontSize(8)
      .text(
        'This invoice was issued from the order as it was paid and is not changed afterwards.',
        left,
        780,
        { width: 495 },
      );

    doc.end();
  });
}
