import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CampaignLedgerService } from '../payouts/campaign-ledger.service';
import {
  OrderStatus,
  PaymentProvider,
  RefundStatus,
  PaymentStatus,
  NotificationChannel,
} from '../generated/prisma/enums';
import { DEFAULT_CURRENCY } from '../constants';
import { AuditAction } from '../generated/prisma/enums';
import { ObservabilityService } from '../observability/observability.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { OUTBOX_EVENT_REFUND_COMPLETED } from '../mail/mail-outbox-templates';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import { ADMIN_NOTIF_REFUND_COMPLETED } from '../admin-notifications/admin-notification-events';

@Injectable()
export class RefundsService {
  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private campaignLedger: CampaignLedgerService,
    private audit: AuditService,
    private observability: ObservabilityService,
    private notificationOutboxDelivery: NotificationOutboxDeliveryService,
    private adminNotify: AdminNotifyService,
  ) {}

  /**
   * Initiate a refund for an order. Resolves Paystack transaction reference from the succeeded payment,
   * calls Paystack Refund API, creates Refund row with providerRef, and on success transitions order to REFUNDED.
   */
  async initiateRefund(
    orderId: string,
    amount: number,
    reason?: string,
    actorUserId?: string,
  ) {
    return this.observability.startSpan(
      'refunds.initiate',
      { 'order.id': orderId, 'refund.amount': amount },
      async () => {
        const order = await this.prisma.order.findUnique({
          where: { id: orderId },
          include: {
            user: { select: { id: true, email: true, firstName: true } },
          },
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

        const payment = await this.prisma.payment.findFirst({
          where: {
            orderId,
            status: PaymentStatus.SUCCEEDED,
            providerRef: { not: null },
          },
        });
        if (!payment?.providerRef) {
          throw new BadRequestException(
            'No succeeded Paystack payment found for this order',
          );
        }

        const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');
        if (!secretKey) {
          throw new BadRequestException('Payment provider is not configured');
        }

        const amountKobo = Math.round(amount * 100);
        const response = await fetch('https://api.paystack.co/refund', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secretKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            transaction: payment.providerRef,
            amount: amountKobo,
            customer_note: reason ?? undefined,
          }),
        });

        const data = (await response.json()) as {
          status?: boolean;
          data?: { id?: number; reference?: string };
          message?: string;
        };
        if (!response.ok || !data.status) {
          throw new BadRequestException(
            data.message ?? 'Paystack refund request failed',
          );
        }

        const providerRef =
          data.data?.reference ?? data.data?.id?.toString() ?? null;

        const refund = await this.prisma.refund.create({
          data: {
            orderId,
            provider: PaymentProvider.PAYSTACK,
            providerRef,
            status: RefundStatus.INITIATED,
            currency: (order.currency as 'NGN') ?? DEFAULT_CURRENCY,
            amount,
            reason: reason ?? null,
          },
        });

        const currency = (order.currency as 'NGN') ?? DEFAULT_CURRENCY;
        await this.prisma.$transaction(async (tx) => {
          await tx.refund.update({
            where: { id: refund.id },
            data: { status: RefundStatus.SUCCEEDED },
          });
          await tx.order.update({
            where: { id: orderId },
            data: { status: OrderStatus.REFUNDED },
          });
          if (order.campaignId) {
            await tx.campaign.update({
              where: { id: order.campaignId },
              data: { currentAmount: { decrement: amount } },
            });
            await this.campaignLedger.createRefundApplied(
              order.campaignId,
              orderId,
              refund.id,
              amount,
              currency,
              { reason: reason ?? undefined },
              tx,
            );
          }
          await this.audit.log(
            {
              eventName: 'admin.order.refund.completed',
              action: AuditAction.REFUND,
              entityType: 'Order',
              entityId: orderId,
              actorUserId: actorUserId ?? null,
              before: { status: order.status },
              after: {
                refundId: refund.id,
                amount,
                status: OrderStatus.REFUNDED,
              },
              note: reason ?? 'Refund completed',
            },
            tx,
          );
        });
        this.observability.recordRefund({ outcome: 'success' });

        const buyer = order.user;
        if (buyer?.email) {
          const notification = await this.prisma.notificationOutbox.create({
            data: {
              eventName: OUTBOX_EVENT_REFUND_COMPLETED,
              channel: NotificationChannel.EMAIL,
              recipient: buyer.email,
              recipientUserId: buyer.id,
              payload: {
                orderId,
                amount,
                currency,
                reason: reason ?? '',
                firstName: buyer.firstName,
              },
            },
          });
          await this.notificationOutboxDelivery.enqueueDelivery(
            notification.id,
          );
        }

        await this.adminNotify.emit(ADMIN_NOTIF_REFUND_COMPLETED, {
          orderId,
          amount,
          currency,
          reason: reason ?? '',
          refundId: refund.id,
        });

        return this.prisma.refund.findUnique({
          where: { id: refund.id },
        });
      },
    );
  }
}
