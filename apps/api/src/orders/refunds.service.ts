import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  OrderStatus,
  PaymentProvider,
  RefundStatus,
  CurrencyCode,
} from '../generated/prisma/enums';

@Injectable()
export class RefundsService {
  constructor(private prisma: PrismaService) {}

  /**
   * Initiate a refund for an order (admin or policy-driven). Creates Refund row; actual Paystack call can be added later.
   */
  async initiateRefund(orderId: string, amount: number, reason?: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });
    if (!order) {
      throw new NotFoundException('Order not found');
    }
    if (order.status !== OrderStatus.PAID) {
      throw new BadRequestException('Only PAID orders can be refunded');
    }
    const orderTotal = Number(order.totalAmount);
    if (amount <= 0 || amount > orderTotal) {
      throw new BadRequestException(
        `Refund amount must be between 0 and ${orderTotal}`,
      );
    }

    const refund = await this.prisma.refund.create({
      data: {
        orderId,
        provider: PaymentProvider.PAYSTACK,
        status: RefundStatus.INITIATED,
        currency: CurrencyCode.NGN,
        amount,
        reason: reason ?? null,
      },
    });

    return refund;
  }
}
