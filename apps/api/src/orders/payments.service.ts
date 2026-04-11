import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { ObservabilityService } from '../observability/observability.service';
import {
  OrderStatus,
  PaymentStatus,
  PaymentProvider,
} from '../generated/prisma/enums';
import { DEFAULT_CURRENCY } from '../constants';

@Injectable()
export class PaymentsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private observability: ObservabilityService,
  ) {}

  /**
   * Initiate Paystack payment for an order. Returns authorization_url for redirect.
   */
  async initiatePayment(
    orderId: string,
    userId: string,
    customerEmail: string | undefined,
  ) {
    return this.observability.startSpan(
      'payments.initiate',
      { 'order.id': orderId, 'user.id': userId },
      async () => {
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
          throw new BadRequestException(
            'Order is not in PENDING_PAYMENT status',
          );
        }
        const existingInitiated = await this.prisma.payment.findFirst({
          where: { orderId, status: PaymentStatus.INITIATED },
        });
        if (existingInitiated) {
          throw new BadRequestException(
            'A payment is already in progress for this order. Complete or wait for it to expire before starting another.',
          );
        }
        const amountKobo = Math.round(Number(order.totalAmount) * 100);
        if (amountKobo <= 0) {
          throw new BadRequestException(
            'Order total must be greater than zero',
          );
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
          this.observability.recordPaymentInitiation({ outcome: 'failure' });
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
          this.observability.recordPaymentInitiation({ outcome: 'failure' });
          throw new BadRequestException(
            'Invalid response from payment provider',
          );
        }

        const ref = data.data.reference;
        await this.prisma.$transaction(async (tx) => {
          await tx.payment.create({
            data: {
              orderId,
              provider: PaymentProvider.PAYSTACK,
              providerRef: ref,
              status: PaymentStatus.INITIATED,
              currency: DEFAULT_CURRENCY,
              amount: order.totalAmount,
              idempotencyKey: ref,
            },
          });
          await tx.order.update({
            where: { id: orderId },
            data: { paymentReference: ref },
          });
        });
        this.observability.recordPaymentInitiation({ outcome: 'success' });

        return {
          authorizationUrl: data.data.authorization_url,
          reference: ref,
          accessCode: data.data.access_code,
        };
      },
    );
  }
}
