import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import {
  OrderStatus,
  PaymentStatus,
  PaymentProvider,
  CurrencyCode,
} from '../generated/prisma/enums';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {}

  /**
   * Initiate Paystack payment for an order. Returns authorization_url for redirect.
   */
  async initiatePayment(
    orderId: string,
    userId: string,
    customerEmail: string,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { user: { select: { email: true } } },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.userId !== userId) {
      throw new ForbiddenException('Access denied');
    }
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw new BadRequestException('Order is not in PENDING_PAYMENT status');
    }
    const amountKobo = Math.round(Number(order.totalAmount) * 100);
    if (amountKobo <= 0) {
      throw new BadRequestException('Order total must be greater than zero');
    }

    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');
    if (!secretKey) {
      throw new BadRequestException('Payment provider is not configured');
    }

    const callbackUrl = this.config.get<string>(
      'PAYSTACK_CALLBACK_URL',
      `${this.config.get('APP_URL', 'http://localhost:3000')}/orders/${orderId}/confirm`,
    );

    const response = await fetch(
      'https://api.paystack.co/transaction/initialize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: customerEmail || order.user?.email,
          amount: amountKobo,
          reference: `order-${orderId}-${Date.now()}`,
          callback_url: callbackUrl,
          metadata: { orderId },
        }),
      },
    );

    if (!response.ok) {
      const err = (await response.json()) as { message?: string };
      throw new BadRequestException(
        err.message || 'Failed to initialize payment',
      );
    }

    const data = (await response.json()) as {
      status?: boolean;
      data?: {
        authorization_url: string;
        reference: string;
        access_code: string;
      };
    };
    if (!data.status || !data.data?.authorization_url) {
      throw new BadRequestException('Invalid response from payment provider');
    }

    await this.prisma.payment.create({
      data: {
        orderId,
        provider: PaymentProvider.PAYSTACK,
        providerRef: data.data.reference,
        status: PaymentStatus.INITIATED,
        currency: CurrencyCode.NGN,
        amount: order.totalAmount,
        idempotencyKey: data.data.reference,
      },
    });

    await this.prisma.order.update({
      where: { id: orderId },
      data: { paymentReference: data.data.reference },
    });

    return {
      authorizationUrl: data.data.authorization_url,
      reference: data.data.reference,
      accessCode: data.data.access_code,
    };
  }
}
