import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import type { Invoice } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { renderInvoicePdf } from './invoice-pdf';
import {
  assertOrderInvoiceable,
  assertSellerDetails,
  buildInvoiceSnapshot,
} from './invoice-snapshot';

const SITE_SETTINGS_ID = 'default';

export interface InvoiceDownload {
  invoice: Invoice;
  pdf: Buffer;
  /** Fixed charset (`INV-000042.pdf`): safe in a Content-Disposition header. */
  filename: string;
}

/** TTW-108: issues one frozen, gap-free numbered VAT invoice per paid order, and renders it. */
@Injectable()
export class InvoicesService {
  private readonly logger = new Logger(InvoicesService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** The owner's invoice. Another user's order and a missing order both answer 404. */
  async getForCustomer(
    userId: string,
    orderId: string,
  ): Promise<InvoiceDownload> {
    const owned = await this.prisma.order.findFirst({
      where: { id: orderId, userId },
      select: { id: true },
    });
    if (!owned) throw new NotFoundException('Order not found');
    return this.download(await this.issueForOrder(orderId));
  }

  async getForAdmin(orderId: string): Promise<InvoiceDownload> {
    const exists = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true },
    });
    if (!exists) throw new NotFoundException('Order not found');
    return this.download(await this.issueForOrder(orderId));
  }

  /**
   * Return the order's invoice, issuing it first when none exists. Safe to call twice or
   * concurrently: the unique `orderId` decides, never a pre-read. The counter is bumped in
   * the insert's transaction, so a lost race rolls its number back and leaves no gap.
   */
  async issueForOrder(orderId: string): Promise<Invoice> {
    const existing = await this.prisma.invoice.findUnique({
      where: { orderId },
    });
    if (existing) return existing;

    try {
      const invoice = await this.prisma.$transaction(async (tx) => {
        // Lock the order row first: a refund or status change takes the same lock, so what is
        // checked below is still true when the invoice is written.
        await tx.$queryRaw`SELECT id FROM orders WHERE id = ${orderId} FOR UPDATE`;
        const order = await tx.order.findUnique({
          where: { id: orderId },
          include: {
            items: { orderBy: { createdAt: 'asc' } },
            user: { select: { firstName: true, lastName: true } },
            refunds: { select: { status: true } },
          },
        });
        if (!order) throw new NotFoundException('Order not found');
        const issuedMeanwhile = await tx.invoice.findUnique({
          where: { orderId },
        });
        if (issuedMeanwhile) return issuedMeanwhile;
        const input = {
          ...order,
          buyerName: [order.user.firstName, order.user.lastName]
            .filter(Boolean)
            .join(' '),
        };
        assertOrderInvoiceable(input);
        // Read inside the transaction: the seller details printed are the ones in force at
        // the moment the number is taken. A refusal here rolls the counter back too.
        const settings = await tx.siteSettings.findUnique({
          where: { id: SITE_SETTINGS_ID },
        });
        const snapshot = buildInvoiceSnapshot(
          input,
          assertSellerDetails(settings),
        );
        const rows = await tx.$queryRaw<Array<{ lastSequence: number }>>`
          INSERT INTO invoice_counters (id, "lastSequence", "updatedAt")
          VALUES (${SITE_SETTINGS_ID}, 1, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE
            SET "lastSequence" = invoice_counters."lastSequence" + 1,
                "updatedAt" = CURRENT_TIMESTAMP
          RETURNING "lastSequence"`;
        const sequence = rows[0].lastSequence;
        return tx.invoice.create({
          data: {
            orderId,
            sequence,
            number: `INV-${String(sequence).padStart(6, '0')}`,
            currency: order.currency,
            sellerLegalName: snapshot.seller.legalName,
            sellerAddress: snapshot.seller.address,
            sellerTaxNumber: snapshot.seller.taxNumber,
            buyerName: snapshot.buyerName,
            buyerAddress: snapshot.buyerAddress,
            lines: snapshot.lines as unknown as Prisma.InputJsonValue,
            subtotalAmount: snapshot.subtotalAmount,
            discountAmount: snapshot.discountAmount,
            shippingFee: snapshot.shippingFee,
            vatRate: snapshot.vatRate,
            vatAmount: snapshot.vatAmount,
            roundingAdjustment: snapshot.roundingAdjustment,
            pricesIncludeVat: snapshot.pricesIncludeVat,
            totalAmount: snapshot.totalAmount,
          },
        });
      });
      this.logger.log(`Issued invoice ${invoice.number} for order ${orderId}`);
      return invoice;
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        // Another request issued this order's invoice first: its row is the answer.
        const winner = await this.prisma.invoice.findUnique({
          where: { orderId },
        });
        if (winner) return winner;
      }
      throw error;
    }
  }

  private async download(invoice: Invoice): Promise<InvoiceDownload> {
    return {
      invoice,
      pdf: await renderInvoicePdf(invoice),
      filename: `${invoice.number}.pdf`,
    };
  }
}
