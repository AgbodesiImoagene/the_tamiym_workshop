import { Injectable, UnauthorizedException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutsService } from '../payouts/payouts.service';
import { CampaignLedgerService } from '../payouts/campaign-ledger.service';
import { AuditService } from '../audit/audit.service';
import {
  OrderStatus,
  PaymentStatus,
  NotificationChannel,
  AuditAction,
  AuditSource,
  PaymentProvider,
} from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import * as crypto from 'node:crypto';
import { ObservabilityService } from '../observability/observability.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import {
  ADMIN_NOTIF_PAYMENT_CONFIRMED,
  ADMIN_NOTIF_PAYMENT_CAPTURED_CANCELLED_ORDER,
} from '../admin-notifications/admin-notification-events';

export interface PaystackWebhookEvent {
  event: string;
  data: {
    reference?: string;
    id?: number;
    status?: string;
    amount?: number;
    currency?: string;
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

@Injectable()
export class PaystackWebhookService {
  private readonly logger = new Logger(PaystackWebhookService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private payoutsService: PayoutsService,
    private campaignLedger: CampaignLedgerService,
    private audit: AuditService,
    private observability: ObservabilityService,
    private notificationOutboxDelivery: NotificationOutboxDeliveryService,
    private adminNotify: AdminNotifyService,
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
   * Process charge.success: settle payment/order exactly once under duplicate/concurrent delivery.
   * Keys off Payment.providerRef. Settlement lock is ChargeSettlementClaim (provider, businessKey).
   */
  async processChargeSuccess(event: PaystackWebhookEvent): Promise<void> {
    await this.observability.startSpan(
      'webhooks.paystack.charge_success',
      { 'paystack.reference': event.data?.reference },
      async () => {
        const reference = event.data?.reference;
        if (!reference) {
          return;
        }

        const payment = await this.prisma.payment.findFirst({
          where: { providerRef: reference },
          include: {
            order: { include: { user: { select: { id: true, email: true } } } },
            settlementClaim: true,
          },
        });
        if (!payment) {
          return;
        }
        if (
          payment.settlementClaim ||
          payment.status === PaymentStatus.SUCCEEDED
        ) {
          this.observability.recordChargeSettlement('duplicate');
          return;
        }

        const order = payment.order;
        if (order.status === OrderStatus.PAID) {
          this.observability.recordChargeSettlement('duplicate');
          return;
        }
        if (order.status === OrderStatus.CANCELLED) {
          this.logger.error(
            `charge.success received for CANCELLED order ${order.id} (ref: ${reference}). Manual refund required.`,
          );
          this.observability.recordWebhook(
            'charge.success.cancelled_order',
            'denied',
          );
          this.observability.recordChargeSettlement('rejected');
          await this.adminNotify.emit(
            ADMIN_NOTIF_PAYMENT_CAPTURED_CANCELLED_ORDER,
            {
              orderId: order.id,
              reference,
              amount: event.data?.amount,
              currency: event.data?.currency ?? order.currency,
              reason: 'Order was already CANCELLED',
            },
          );
          return;
        }
        if (order.expiresAt && order.expiresAt < new Date()) {
          this.logger.error(
            `charge.success received for expired order ${order.id} (ref: ${reference}). Manual refund required.`,
          );
          this.observability.recordWebhook(
            'charge.success.expired_order',
            'denied',
          );
          this.observability.recordChargeSettlement('rejected');
          await this.adminNotify.emit(
            ADMIN_NOTIF_PAYMENT_CAPTURED_CANCELLED_ORDER,
            {
              orderId: order.id,
              reference,
              amount: event.data?.amount,
              currency: event.data?.currency ?? order.currency,
              reason: 'Order was already expired',
            },
          );
          return;
        }
        if (order.status !== OrderStatus.PENDING_PAYMENT) {
          return;
        }

        if (event.data?.amount != null) {
          const expectedKobo = Math.round(Number(order.totalAmount) * 100);
          if (event.data.amount !== expectedKobo) {
            this.logger.error(
              `charge.success amount mismatch for order ${order.id}: ` +
                `expected ${expectedKobo} kobo, got ${event.data.amount} (ref: ${reference})`,
            );
            this.observability.recordWebhook(
              'charge.success.amount_mismatch',
              'denied',
            );
            this.observability.recordChargeSettlement('rejected');
            await this.adminNotify.emit(
              ADMIN_NOTIF_PAYMENT_CAPTURED_CANCELLED_ORDER,
              {
                orderId: order.id,
                reference,
                amount: event.data.amount,
                currency: event.data?.currency ?? order.currency,
                reason: `Amount mismatch: expected ${expectedKobo} kobo, received ${event.data.amount} kobo`,
              },
            );
            return;
          }
        }
        if (
          event.data?.currency != null &&
          event.data.currency !== order.currency
        ) {
          this.logger.error(
            `charge.success currency mismatch for order ${order.id}: ` +
              `expected ${order.currency}, got ${event.data.currency} (ref: ${reference})`,
          );
          this.observability.recordWebhook(
            'charge.success.currency_mismatch',
            'denied',
          );
          this.observability.recordChargeSettlement('rejected');
          await this.adminNotify.emit(
            ADMIN_NOTIF_PAYMENT_CAPTURED_CANCELLED_ORDER,
            {
              orderId: order.id,
              reference,
              amount: event.data?.amount,
              currency: event.data.currency,
              reason: `Currency mismatch: expected ${order.currency}, received ${event.data.currency}`,
            },
          );
          return;
        }
        if (event.data?.status != null && event.data.status !== 'success') {
          return;
        }

        const settledAt = new Date();
        let availableAt: Date | undefined;
        if (order.campaignId) {
          const holdDays = await this.campaignLedger.getSettlementHoldDays();
          availableAt = new Date(settledAt);
          availableAt.setDate(availableAt.getDate() + holdDays);
        }

        const businessKey = `charge.success:${reference}`;
        const paymentConfirmedDedupeKey = `PaymentConfirmed:${order.id}`;
        let notificationId: string | undefined;

        try {
          await this.prisma.$transaction(async (tx) => {
            await tx.chargeSettlementClaim.create({
              data: {
                provider: payment.provider ?? PaymentProvider.PAYSTACK,
                businessKey,
                paymentId: payment.id,
                orderId: order.id,
              },
            });

            await tx.payment.update({
              where: { id: payment.id },
              data: {
                status: PaymentStatus.SUCCEEDED,
                rawEvent: event as unknown as object,
              },
            });

            const orderUpdate = await tx.order.updateMany({
              where: {
                id: order.id,
                status: OrderStatus.PENDING_PAYMENT,
              },
              data: {
                status: OrderStatus.PAID,
                paymentStatus: PaymentStatus.SUCCEEDED,
              },
            });
            if (orderUpdate.count !== 1) {
              throw new Error(
                `charge.success claim won but order ${order.id} was not PENDING_PAYMENT`,
              );
            }

            if (order.campaignId) {
              await tx.campaign.update({
                where: { id: order.campaignId },
                data: {
                  currentAmount: { increment: order.totalAmount },
                },
              });
              await this.campaignLedger.createPaymentSettled(
                order.campaignId,
                order.id,
                Number(order.totalAmount),
                order.currency,
                settledAt,
                {
                  availableAt,
                  metadata: { orderTotal: Number(order.totalAmount) },
                },
                tx,
              );
            }

            await this.audit.log(
              {
                eventName: 'webhook.payment.charge_success',
                action: AuditAction.STATUS_CHANGE,
                entityType: 'Order',
                entityId: order.id,
                before: { status: order.status, paymentStatus: payment.status },
                after: {
                  status: OrderStatus.PAID,
                  paymentStatus: PaymentStatus.SUCCEEDED,
                  providerRef: reference,
                  settlementBusinessKey: businessKey,
                },
                metadata: event as unknown as object,
                note: 'Paystack charge.success settled payment',
                source: AuditSource.WEBHOOK,
              },
              tx,
            );

            const orderUser = (
              payment.order as { user?: { id: string; email: string } }
            )?.user;
            if (orderUser?.email) {
              const notification = await tx.notificationOutbox.create({
                data: {
                  eventName: 'PaymentConfirmed',
                  channel: NotificationChannel.EMAIL,
                  recipient: orderUser.email,
                  recipientUserId: orderUser.id,
                  dedupeKey: paymentConfirmedDedupeKey,
                  payload: {
                    orderId: order.id,
                    reference,
                    amount: Number(order.totalAmount),
                    currency: order.currency,
                  },
                },
              });
              notificationId = notification.id;
            }
          });
        } catch (error) {
          if (isUniqueConstraintError(error)) {
            this.observability.recordChargeSettlement('duplicate');
            this.logger.log(
              `Duplicate charge.success ignored for ref ${reference} (settlement claim already exists)`,
            );
            return;
          }
          throw error;
        }

        this.observability.recordChargeSettlement('settled');

        if (notificationId) {
          await this.notificationOutboxDelivery.enqueueDelivery(notificationId);
        }

        const orderUser = (
          payment.order as { user?: { id: string; email: string } }
        )?.user;
        await this.adminNotify.emit(ADMIN_NOTIF_PAYMENT_CONFIRMED, {
          orderId: order.id,
          reference,
          amount: Number(order.totalAmount),
          currency: order.currency,
          userId: orderUser?.id ?? '',
        });
      },
    );
  }

  /**
   * Process transfer webhook events: exactly-once status + ledger + run completion (TTW-011).
   */
  async processTransferEvent(
    event: string,
    reference: string | undefined,
    rawPayload?: object,
  ): Promise<boolean> {
    if (!reference) return false;
    if (
      event !== 'transfer.success' &&
      event !== 'transfer.failed' &&
      event !== 'transfer.reversed'
    ) {
      return false;
    }
    this.observability.recordWebhook(event, 'success');
    return this.payoutsService.applyTransferWebhookEvent(
      event,
      reference,
      rawPayload,
    );
  }

  /**
   * Parse raw body and process event. Returns true if handled.
   */
  async handleWebhook(
    rawBody: string | Buffer,
    signature: string,
  ): Promise<boolean> {
    if (!this.verifySignature(rawBody, signature)) {
      this.observability.recordWebhook('paystack.invalid_signature', 'denied');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    const payload = JSON.parse(
      typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8'),
    ) as PaystackWebhookEvent;

    if (payload.event === 'charge.success') {
      this.observability.recordWebhook(payload.event, 'success');
      await this.processChargeSuccess(payload);
      return true;
    }

    const ref =
      payload.data?.reference ??
      (payload.data as { transfer_code?: string })?.transfer_code;
    if (
      payload.event === 'transfer.success' ||
      payload.event === 'transfer.failed' ||
      payload.event === 'transfer.reversed'
    ) {
      return this.processTransferEvent(payload.event, ref, payload as object);
    }

    return false;
  }
}
