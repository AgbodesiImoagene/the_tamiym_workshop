import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums';
import * as crypto from 'node:crypto';

export interface PaystackWebhookEvent {
  event: string;
  data: {
    reference?: string;
    id?: number;
    status?: string;
  };
}

@Injectable()
export class PaystackWebhookService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Verify Paystack webhook signature (x-paystack-signature = HMAC SHA512 of body).
   */
  verifySignature(rawBody: string | Buffer, signature: string): boolean {
    const secret = this.config.get<string>('PAYSTACK_SECRET_KEY');
    if (!secret) {
      return false;
    }
    const hash = crypto
      .createHmac('sha512', secret)
      .update(rawBody)
      .digest('hex');
    return hash === signature;
  }

  /**
   * Process charge.success event: idempotent update of Payment and Order.
   */
  async processChargeSuccess(event: PaystackWebhookEvent): Promise<void> {
    const reference = event.data?.reference;
    if (!reference) {
      return;
    }
    const idempotencyKey = reference;

    const existingPayment = await this.prisma.payment.findUnique({
      where: { idempotencyKey },
    });
    if (existingPayment?.status === PaymentStatus.SUCCEEDED) {
      return;
    }

    const order = await this.prisma.order.findFirst({
      where: { paymentReference: reference },
    });
    if (!order) {
      return;
    }
    if (order.status === OrderStatus.PAID) {
      return;
    }

    const paymentToUpdate = await this.prisma.payment.findFirst({
      where: { orderId: order.id, idempotencyKey },
    });
    if (paymentToUpdate) {
      await this.prisma.payment.update({
        where: { id: paymentToUpdate.id },
        data: {
          status: PaymentStatus.SUCCEEDED,
          rawEvent: event as unknown as object,
        },
      });
    }

    await this.prisma.order.update({
      where: { id: order.id },
      data: {
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.SUCCEEDED,
      },
    });
  }

  /**
   * Parse raw body and process event. Returns true if handled.
   */
  async handleWebhook(
    rawBody: string | Buffer,
    signature: string,
  ): Promise<boolean> {
    if (!this.verifySignature(rawBody, signature)) {
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const payload = JSON.parse(
      typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'),
    ) as PaystackWebhookEvent;

    if (payload.event === 'charge.success') {
      await this.processChargeSuccess(payload);
      return true;
    }

    return false;
  }
}
