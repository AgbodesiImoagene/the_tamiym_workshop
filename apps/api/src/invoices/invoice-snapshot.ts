import { BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';

export type Money = string | number | Prisma.Decimal;

/** What the invoice needs from an order. Everything here is already frozen on the order. */
export interface InvoiceOrderInput {
  id: string;
  status: string;
  paymentStatus: string;
  currency: string;
  subtotalAmount: Money;
  discountAmount: Money;
  shippingFee: Money;
  vatAmount: Money | null;
  vatRateSnapshot: Money | null;
  pricesIncludeVatSnapshot: boolean | null;
  roundingAdjustment: Money | null;
  totalAmount: Money;
  /** The account holder's full name: who is billed. */
  buyerName: string | null;
  /** Every refund of the order, whatever its state. */
  refunds: Array<{ status: string }>;
  shipRecipientName: string | null;
  shipLine1: string;
  shipLine2: string | null;
  shipCity: string;
  shipState: string;
  shipPostalCode: string | null;
  shipCountry: string;
  items: Array<{
    quantity: number;
    unitFinalPrice: Money;
    unitDiscountAmount: Money;
    productNameSnapshot: string;
    variantDisplaySnapshot: string;
  }>;
}

export interface InvoiceSellerSettings {
  invoiceSellerLegalName: string | null;
  invoiceSellerAddress: string | null;
  invoiceSellerTaxNumber: string | null;
}

export interface InvoiceSeller {
  legalName: string;
  address: string;
  taxNumber: string;
}

export interface InvoiceLine {
  description: string;
  quantity: number;
  unitPrice: string;
  lineTotal: string;
}

export interface InvoiceSnapshot {
  seller: InvoiceSeller;
  buyerName: string;
  buyerAddress: string;
  currency: string;
  lines: InvoiceLine[];
  subtotalAmount: string;
  discountAmount: string;
  shippingFee: string;
  vatRate: string;
  vatAmount: string;
  roundingAdjustment: string | null;
  pricesIncludeVat: boolean;
  totalAmount: string;
}

/** Order statuses that may receive a first invoice. Refunded orders would need a credit note. */
const INVOICEABLE_STATUSES = new Set([
  'PAID',
  'PROCESSING',
  'FULFILLED',
  'DELIVERED',
]);

export const INVOICE_ORDER_NOT_ELIGIBLE = 'INVOICE_ORDER_NOT_ELIGIBLE';
export const INVOICE_ORDER_TOTALS_MISMATCH = 'INVOICE_ORDER_TOTALS_MISMATCH';
export const INVOICE_SELLER_DETAILS_MISSING = 'INVOICE_SELLER_DETAILS_MISSING';

/** Refuse an order that cannot get a first invoice (unpaid, cancelled, refunded, legacy). */
export function assertOrderInvoiceable(order: InvoiceOrderInput): void {
  if (
    order.paymentStatus !== 'SUCCEEDED' ||
    !INVOICEABLE_STATUSES.has(order.status)
  ) {
    throw new BadRequestException({
      code: INVOICE_ORDER_NOT_ELIGIBLE,
      message: 'An invoice is available once the order is paid.',
    });
  }
  // A refund that is confirmed or still in flight changes what was paid: that needs a credit
  // note, not an invoice at full price. The order status alone is not enough, because an admin
  // can move a partially refunded order back to PROCESSING.
  if (order.refunds.some((refund) => refund.status !== 'FAILED')) {
    throw new BadRequestException({
      code: INVOICE_ORDER_NOT_ELIGIBLE,
      message: 'A refunded order cannot be invoiced.',
    });
  }
  if (order.vatAmount == null || order.vatRateSnapshot == null) {
    throw new BadRequestException({
      code: INVOICE_ORDER_NOT_ELIGIBLE,
      message: 'This order has no recorded VAT, so no invoice can be issued.',
    });
  }
}

/** The three seller fields must all be set. Nothing partial is ever printed. */
export function assertSellerDetails(
  settings: InvoiceSellerSettings | null,
): InvoiceSeller {
  const legalName = settings?.invoiceSellerLegalName?.trim();
  const address = settings?.invoiceSellerAddress?.trim();
  const taxNumber = settings?.invoiceSellerTaxNumber?.trim();
  if (!legalName || !address || !taxNumber) {
    throw new ConflictException({
      code: INVOICE_SELLER_DETAILS_MISSING,
      message:
        'Invoices are not available yet. The seller details are not set up.',
    });
  }
  return { legalName, address, taxNumber };
}

function money(value: Money): string {
  return new Prisma.Decimal(value).toFixed(2);
}

/** Build the frozen copy of an order that the invoice stores. Pure: no clock, no database. */
export function buildInvoiceSnapshot(
  order: InvoiceOrderInput,
  seller: InvoiceSeller,
): InvoiceSnapshot {
  // The order subtotal is before discounts, so each line is printed at its price before
  // the unit discount: the lines then add up to the subtotal, and the discount is shown once.
  const lines = order.items.map((item) => {
    const unitPrice = new Prisma.Decimal(item.unitFinalPrice).plus(
      item.unitDiscountAmount,
    );
    return {
      description: `${item.productNameSnapshot}: ${item.variantDisplaySnapshot}`,
      quantity: item.quantity,
      unitPrice: unitPrice.toFixed(2),
      lineTotal: unitPrice.times(item.quantity).toFixed(2),
    };
  });
  const linesTotal = lines.reduce(
    (sum, line) => sum.plus(line.lineTotal),
    new Prisma.Decimal(0),
  );
  if (!linesTotal.equals(new Prisma.Decimal(order.subtotalAmount))) {
    // An immutable, numbered invoice must never print lines that contradict its totals.
    throw new ConflictException({
      code: INVOICE_ORDER_TOTALS_MISMATCH,
      message:
        'This order cannot be invoiced: its lines do not match its total.',
    });
  }
  const buyerAddress = [
    order.shipLine1,
    order.shipLine2,
    order.shipCity,
    order.shipState,
    order.shipPostalCode,
    order.shipCountry,
  ]
    .filter((part): part is string => !!part && part.trim().length > 0)
    .join(', ');
  return {
    seller,
    buyerName:
      order.buyerName?.trim() || order.shipRecipientName?.trim() || 'Customer',
    buyerAddress,
    currency: order.currency,
    lines,
    subtotalAmount: money(order.subtotalAmount),
    discountAmount: money(order.discountAmount),
    shippingFee: money(order.shippingFee),
    vatRate: new Prisma.Decimal(order.vatRateSnapshot as Money).toFixed(4),
    vatAmount: money(order.vatAmount as Money),
    roundingAdjustment:
      order.roundingAdjustment == null ? null : money(order.roundingAdjustment),
    pricesIncludeVat: order.pricesIncludeVatSnapshot ?? true,
    totalAmount: money(order.totalAmount),
  };
}
