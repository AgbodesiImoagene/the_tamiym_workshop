import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { CampaignLedgerService } from '../payouts/campaign-ledger.service';
import {
  OrderStatus,
  PaymentProvider,
  RefundStatus,
  PaymentStatus,
  NotificationChannel,
  AuditAction,
  AuditSource,
} from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { DEFAULT_CURRENCY } from '../constants';
import { ObservabilityService } from '../observability/observability.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { OUTBOX_EVENT_REFUND_COMPLETED } from '../mail/mail-outbox-templates';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import { ADMIN_NOTIF_REFUND_COMPLETED } from '../admin-notifications/admin-notification-events';
import {
  PaystackRefundClient,
  PaystackRefundTransientError,
} from './paystack-refund.client';

/** Order statuses that may receive a new provider refund attempt. */
const REFUNDABLE_ORDER_STATUSES: ReadonlySet<OrderStatus> = new Set([
  OrderStatus.PAID,
  OrderStatus.PROCESSING,
  OrderStatus.FULFILLED,
  OrderStatus.DELIVERED,
  OrderStatus.PARTIALLY_REFUNDED,
]);

/** Statuses that count toward the cumulative captured-value cap. */
const IN_FLIGHT_OR_SUCCEEDED: ReadonlySet<RefundStatus> = new Set([
  RefundStatus.INITIATED,
  RefundStatus.PROCESSING,
  RefundStatus.NEEDS_ATTENTION,
  RefundStatus.SUCCEEDED,
]);

export type PaystackRefundWebhookPayload = {
  event: string;
  data: {
    id?: number;
    status?: string;
    amount?: number | string;
    currency?: string;
    transaction_reference?: string;
    refund_reference?: string | null;
    customer_note?: string;
    merchant_note?: string;
    [key: string]: unknown;
  };
};

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function money(n: Prisma.Decimal | number | string): number {
  return Number(n);
}

function providerStatusToRefundStatus(
  providerStatus: string | undefined,
): RefundStatus {
  switch ((providerStatus ?? '').toLowerCase()) {
    case 'processed':
      return RefundStatus.SUCCEEDED;
    case 'failed':
      return RefundStatus.FAILED;
    case 'needs-attention':
      return RefundStatus.NEEDS_ATTENTION;
    case 'processing':
      return RefundStatus.PROCESSING;
    case 'pending':
    default:
      return RefundStatus.PROCESSING;
  }
}

@Injectable()
export class RefundsService {
  private readonly logger = new Logger(RefundsService.name);

  constructor(
    private prisma: PrismaService,
    private campaignLedger: CampaignLedgerService,
    private audit: AuditService,
    private observability: ObservabilityService,
    private notificationOutboxDelivery: NotificationOutboxDeliveryService,
    private adminNotify: AdminNotifyService,
    private paystackRefundClient: PaystackRefundClient,
  ) {}

  /**
   * Initiate a provider refund. Reserves an INITIATED row under the cumulative
   * cap before calling Paystack. Financial effects apply only on
   * provider-confirmed `refund.processed` settlement (TTW-013).
   */
  async initiateRefund(
    orderId: string,
    amount: number,
    reason?: string,
    actorUserId?: string,
    idempotencyKey?: string,
  ) {
    return this.observability.startSpan(
      'refunds.initiate',
      { 'order.id': orderId, 'refund.amount': amount },
      async () => {
        if (amount <= 0) {
          throw new BadRequestException('Refund amount must be greater than 0');
        }

        if (idempotencyKey) {
          const existing = await this.prisma.refund.findUnique({
            where: { idempotencyKey },
          });
          if (existing) {
            if (existing.orderId !== orderId) {
              throw new ConflictException(
                'Idempotency key already used for a different order',
              );
            }
            this.observability.recordRefund({ outcome: 'success' });
            this.observability.recordRefundSettlement('reused');
            return existing;
          }
        }

        const reserved = await this.prisma.$transaction(async (tx) => {
          const order = await tx.order.findUnique({
            where: { id: orderId },
            include: {
              user: { select: { id: true, email: true, firstName: true } },
            },
          });
          if (!order) {
            throw new NotFoundException('Order not found');
          }
          if (!REFUNDABLE_ORDER_STATUSES.has(order.status)) {
            throw new BadRequestException(
              `Order status ${order.status} is not refundable`,
            );
          }

          const payment = await tx.payment.findFirst({
            where: {
              orderId,
              status: PaymentStatus.SUCCEEDED,
              providerRef: { not: null },
            },
            orderBy: { createdAt: 'asc' },
          });
          if (!payment?.providerRef) {
            throw new BadRequestException(
              'No succeeded Paystack payment found for this order',
            );
          }

          const captured = money(payment.amount);
          if (amount > captured) {
            throw new BadRequestException(
              `Refund amount must be between 0 and ${captured}`,
            );
          }

          const prior = await tx.refund.findMany({
            where: {
              orderId,
              status: { in: [...IN_FLIGHT_OR_SUCCEEDED] },
            },
            select: { amount: true, status: true },
          });
          const committed = prior.reduce((sum, r) => sum + money(r.amount), 0);
          if (committed + amount > captured + 1e-9) {
            throw new BadRequestException(
              `Refund would exceed captured value: committed=${committed}, request=${amount}, captured=${captured}`,
            );
          }

          try {
            return {
              order,
              payment,
              refund: await tx.refund.create({
                data: {
                  orderId,
                  paymentId: payment.id,
                  provider: PaymentProvider.PAYSTACK,
                  status: RefundStatus.INITIATED,
                  currency: (order.currency as 'NGN') ?? DEFAULT_CURRENCY,
                  amount,
                  reason: reason ?? null,
                  transactionReference: payment.providerRef,
                  idempotencyKey: idempotencyKey ?? null,
                },
              }),
            };
          } catch (error) {
            if (isUniqueConstraintError(error) && idempotencyKey) {
              const raced = await tx.refund.findUnique({
                where: { idempotencyKey },
              });
              if (raced) {
                return { order, payment, refund: raced, reused: true as const };
              }
            }
            throw error;
          }
        });

        if ('reused' in reserved && reserved.reused) {
          this.observability.recordRefund({ outcome: 'success' });
          this.observability.recordRefundSettlement('reused');
          return reserved.refund;
        }

        const { payment, refund } = reserved;

        try {
          const providerResult = await this.paystackRefundClient.createRefund({
            transactionReference: payment.providerRef!,
            amountKobo: Math.round(amount * 100),
            customerNote: reason,
            merchantNote: reason,
          });

          const nextStatus = providerStatusToRefundStatus(
            providerResult.providerStatus,
          );
          // Provider may return processed synchronously — still settle via claim path.
          const updated = await this.prisma.refund.update({
            where: { id: refund.id },
            data: {
              providerRef: providerResult.providerRefundId,
              transactionReference: providerResult.transactionReference,
              status:
                nextStatus === RefundStatus.SUCCEEDED
                  ? RefundStatus.PROCESSING
                  : nextStatus === RefundStatus.FAILED
                    ? RefundStatus.FAILED
                    : nextStatus,
            },
          });

          await this.audit.log({
            eventName: 'admin.order.refund.initiated',
            action: AuditAction.REFUND,
            entityType: 'Refund',
            entityId: refund.id,
            actorUserId: actorUserId ?? null,
            before: { status: RefundStatus.INITIATED },
            after: {
              status: updated.status,
              providerRef: updated.providerRef,
              amount,
            },
            note: reason ?? 'Refund initiated with provider',
          });

          if (providerResult.providerStatus.toLowerCase() === 'processed') {
            await this.settleRefundProcessed({
              event: 'refund.processed',
              data: {
                id: Number(providerResult.providerRefundId),
                status: 'processed',
                amount: providerResult.amountKobo,
                currency: providerResult.currency,
                transaction_reference: providerResult.transactionReference,
                refund_reference: providerResult.refundReference,
              },
            });
            return this.prisma.refund.findUniqueOrThrow({
              where: { id: refund.id },
            });
          }

          if (updated.status === RefundStatus.FAILED) {
            this.observability.recordRefund({ outcome: 'failure' });
            this.observability.recordRefundSettlement('failed');
          } else {
            this.observability.recordRefund({ outcome: 'success' });
            this.observability.recordRefundSettlement('initiated');
          }

          return updated;
        } catch (error) {
          if (error instanceof PaystackRefundTransientError) {
            this.logger.warn(
              `Paystack refund transient failure for ${refund.id}: ${error.message}`,
            );
            this.observability.recordRefund({ outcome: 'failure' });
            this.observability.recordRefundSettlement('provider_transient');
            throw new ConflictException(
              'Refund provider is temporarily unavailable; retry the same request',
            );
          }

          // Hard provider rejection: release the in-flight reservation.
          await this.prisma.refund.update({
            where: { id: refund.id },
            data: { status: RefundStatus.FAILED },
          });
          this.observability.recordRefund({ outcome: 'failure' });
          this.observability.recordRefundSettlement('provider_rejected');
          throw error;
        }
      },
    );
  }

  /**
   * Apply a Paystack refund.* webhook. Financial effects run only for
   * refund.processed under an exactly-once RefundSettlementClaim.
   */
  async applyRefundWebhookEvent(
    payload: PaystackRefundWebhookPayload,
  ): Promise<boolean> {
    const event = payload.event;
    if (
      event !== 'refund.pending' &&
      event !== 'refund.processing' &&
      event !== 'refund.needs-attention' &&
      event !== 'refund.failed' &&
      event !== 'refund.processed'
    ) {
      return false;
    }

    if (event === 'refund.processed') {
      return this.settleRefundProcessed(payload);
    }
    if (event === 'refund.failed') {
      return this.markRefundFailed(payload);
    }
    return this.markRefundInFlight(payload, event);
  }

  private async findRefundForWebhook(
    data: PaystackRefundWebhookPayload['data'],
  ) {
    const providerRefundId =
      data.id != null ? String(data.id) : data.refund_reference;
    if (providerRefundId) {
      const byRef = await this.prisma.refund.findFirst({
        where: {
          provider: PaymentProvider.PAYSTACK,
          providerRef: String(providerRefundId),
        },
        include: {
          order: {
            include: {
              user: { select: { id: true, email: true, firstName: true } },
            },
          },
          settlementClaim: true,
          payment: true,
        },
      });
      if (byRef) return byRef;
    }

    const txnRef = data.transaction_reference;
    if (!txnRef) return null;

    const amountMajor =
      data.amount != null ? money(data.amount) / 100 : undefined;

    return this.prisma.refund.findFirst({
      where: {
        transactionReference: txnRef,
        status: {
          in: [
            RefundStatus.INITIATED,
            RefundStatus.PROCESSING,
            RefundStatus.NEEDS_ATTENTION,
          ],
        },
        ...(amountMajor != null ? { amount: amountMajor } : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        order: {
          include: {
            user: { select: { id: true, email: true, firstName: true } },
          },
        },
        settlementClaim: true,
        payment: true,
      },
    });
  }

  private async markRefundInFlight(
    payload: PaystackRefundWebhookPayload,
    event: string,
  ): Promise<boolean> {
    const refund = await this.findRefundForWebhook(payload.data);
    if (!refund) {
      this.observability.recordRefundSettlement('unmatched');
      return false;
    }
    if (
      refund.status === RefundStatus.SUCCEEDED ||
      refund.status === RefundStatus.FAILED
    ) {
      this.observability.recordRefundSettlement('stale');
      return true;
    }

    const next =
      event === 'refund.needs-attention'
        ? RefundStatus.NEEDS_ATTENTION
        : RefundStatus.PROCESSING;

    await this.prisma.refund.update({
      where: { id: refund.id },
      data: {
        status: next,
        providerRef:
          payload.data.id != null
            ? String(payload.data.id)
            : (refund.providerRef ?? undefined),
        transactionReference:
          payload.data.transaction_reference ??
          refund.transactionReference ??
          undefined,
      },
    });
    this.observability.recordRefundSettlement('status_updated');
    return true;
  }

  private async markRefundFailed(
    payload: PaystackRefundWebhookPayload,
  ): Promise<boolean> {
    const refund = await this.findRefundForWebhook(payload.data);
    if (!refund) {
      this.observability.recordRefundSettlement('unmatched');
      return false;
    }
    if (refund.status === RefundStatus.SUCCEEDED) {
      // Out-of-order: already settled — do not unwind without reconciliation.
      this.logger.error(
        `refund.failed received after SUCCEEDED for refund ${refund.id}; leaving settled`,
      );
      this.observability.recordRefundSettlement('stale');
      return true;
    }
    if (refund.status === RefundStatus.FAILED) {
      this.observability.recordRefundSettlement('duplicate');
      return true;
    }

    await this.prisma.refund.update({
      where: { id: refund.id },
      data: {
        status: RefundStatus.FAILED,
        providerRef:
          payload.data.id != null
            ? String(payload.data.id)
            : (refund.providerRef ?? undefined),
      },
    });
    this.observability.recordRefundSettlement('failed');
    return true;
  }

  /**
   * Exactly-once financial settlement for refund.processed.
   */
  private async settleRefundProcessed(
    payload: PaystackRefundWebhookPayload,
  ): Promise<boolean> {
    const refund = await this.findRefundForWebhook(payload.data);
    if (!refund) {
      this.observability.recordRefundSettlement('unmatched');
      return false;
    }
    if (refund.settlementClaim || refund.status === RefundStatus.SUCCEEDED) {
      this.observability.recordRefundSettlement('duplicate');
      return true;
    }

    const providerRef =
      payload.data.id != null
        ? String(payload.data.id)
        : (refund.providerRef ?? refund.id);
    const businessKey = `refund.processed:${providerRef}`;
    const amount = money(refund.amount);
    const currency = (refund.order.currency as 'NGN') ?? DEFAULT_CURRENCY;
    const order = refund.order;
    const captured = money(refund.payment?.amount ?? order.totalAmount);

    let notificationId: string | undefined;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.refundSettlementClaim.create({
          data: {
            provider: refund.provider ?? PaymentProvider.PAYSTACK,
            businessKey,
            refundId: refund.id,
            orderId: order.id,
          },
        });

        const statusUpdate = await tx.refund.updateMany({
          where: {
            id: refund.id,
            status: {
              in: [
                RefundStatus.INITIATED,
                RefundStatus.PROCESSING,
                RefundStatus.NEEDS_ATTENTION,
              ],
            },
          },
          data: {
            status: RefundStatus.SUCCEEDED,
            providerRef,
            transactionReference:
              payload.data.transaction_reference ?? refund.transactionReference,
          },
        });
        if (statusUpdate.count !== 1) {
          throw new Error(
            `refund.processed claim won but refund ${refund.id} was already terminal`,
          );
        }

        const succeeded = await tx.refund.findMany({
          where: { orderId: order.id, status: RefundStatus.SUCCEEDED },
          select: { amount: true },
        });
        const succeededSum = succeeded.reduce(
          (sum, r) => sum + money(r.amount),
          0,
        );
        const nextOrderStatus =
          succeededSum + 1e-9 >= captured
            ? OrderStatus.REFUNDED
            : OrderStatus.PARTIALLY_REFUNDED;

        await tx.order.update({
          where: { id: order.id },
          data: { status: nextOrderStatus },
        });

        if (order.campaignId) {
          await tx.campaign.update({
            where: { id: order.campaignId },
            data: { currentAmount: { decrement: amount } },
          });
          await this.campaignLedger.createRefundApplied(
            order.campaignId,
            order.id,
            refund.id,
            amount,
            currency,
            { reason: refund.reason ?? undefined },
            tx,
          );
        }

        await this.audit.log(
          {
            eventName: 'webhook.refund.processed',
            action: AuditAction.REFUND,
            entityType: 'Order',
            entityId: order.id,
            before: { status: order.status, refundStatus: refund.status },
            after: {
              status: nextOrderStatus,
              refundId: refund.id,
              amount,
              settlementBusinessKey: businessKey,
            },
            metadata: payload as unknown as object,
            note: 'Paystack refund.processed settled refund',
            source: AuditSource.WEBHOOK,
          },
          tx,
        );

        const buyer = order.user;
        if (buyer?.email) {
          const dedupeKey = `RefundCompleted:${refund.id}`;
          const notification = await tx.notificationOutbox.create({
            data: {
              eventName: OUTBOX_EVENT_REFUND_COMPLETED,
              channel: NotificationChannel.EMAIL,
              recipient: buyer.email,
              recipientUserId: buyer.id,
              dedupeKey,
              payload: {
                orderId: order.id,
                amount,
                currency,
                reason: refund.reason ?? '',
                firstName: buyer.firstName,
                orderStatus: nextOrderStatus,
              },
            },
          });
          notificationId = notification.id;
        }
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        this.observability.recordRefundSettlement('duplicate');
        return true;
      }
      throw error;
    }

    if (notificationId) {
      await this.notificationOutboxDelivery.enqueueDelivery(notificationId);
    }

    await this.adminNotify.emit(ADMIN_NOTIF_REFUND_COMPLETED, {
      orderId: order.id,
      amount,
      currency,
      reason: refund.reason ?? '',
      refundId: refund.id,
    });

    this.observability.recordRefund({ outcome: 'success' });
    this.observability.recordRefundSettlement('settled');
    return true;
  }
}
