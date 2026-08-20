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

/** Non-terminal statuses eligible for provider status updates. */
const IN_FLIGHT: ReadonlySet<RefundStatus> = new Set([
  RefundStatus.INITIATED,
  RefundStatus.PROCESSING,
  RefundStatus.NEEDS_ATTENTION,
]);

/** Stale INITIATED without providerRef may be re-driven (TTW-013). */
const STALE_INITIATED_MS = 45_000;

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

type RefundWithRelations = Prisma.RefundGetPayload<{
  include: {
    order: {
      include: {
        user: { select: { id: true; email: true; firstName: true } };
      };
    };
    settlementClaim: true;
    payment: true;
  };
}>;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function money(n: Prisma.Decimal | number | string): number {
  return Number(n);
}

function providerAmountMajor(
  amount: number | string | undefined,
): number | null {
  if (amount == null) return null;
  const raw = money(amount);
  if (!Number.isFinite(raw)) return null;
  // Paystack refund webhooks report kobo as integer/string.
  return raw / 100;
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

function deriveOrderStatusAfterRefund(
  current: OrderStatus,
  succeededSum: number,
  captured: number,
): OrderStatus {
  if (succeededSum + 1e-9 >= captured) {
    return OrderStatus.REFUNDED;
  }
  // Keep fulfilment progress; only rewrite unpaid/paid money states.
  if (
    current === OrderStatus.PAID ||
    current === OrderStatus.PARTIALLY_REFUNDED
  ) {
    return OrderStatus.PARTIALLY_REFUNDED;
  }
  return current;
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
        if (!(amount > 0)) {
          throw new BadRequestException('Refund amount must be greater than 0');
        }

        // Clear only stale drive claims (never release the captured-value cap).
        await this.clearStaleDriveClaims();

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
            if (money(existing.amount) !== amount) {
              throw new ConflictException(
                'Idempotency key already used with a different amount',
              );
            }
            // Re-drive when still INITIATED (null / driving) or NEEDS_ATTENTION.
            if (
              existing.status === RefundStatus.INITIATED ||
              existing.status === RefundStatus.NEEDS_ATTENTION
            ) {
              if (existing.status === RefundStatus.NEEDS_ATTENTION) {
                await this.prisma.refund.updateMany({
                  where: {
                    id: existing.id,
                    status: RefundStatus.NEEDS_ATTENTION,
                  },
                  data: {
                    status: RefundStatus.INITIATED,
                    providerRef: null,
                  },
                });
              }
              return this.driveProviderForReservedRefund(
                existing.id,
                money(existing.amount),
                reason,
                actorUserId,
              );
            }
            this.observability.recordRefund({
              outcome:
                existing.status === RefundStatus.FAILED ? 'failure' : 'success',
            });
            this.observability.recordRefundSettlement('reused');
            return existing;
          }
        }

        const reserved = await this.reserveRefundRow(
          orderId,
          amount,
          reason,
          idempotencyKey,
        );

        if (reserved.reused && reserved.refund.providerRef) {
          this.observability.recordRefund({ outcome: 'success' });
          this.observability.recordRefundSettlement('reused');
          return reserved.refund;
        }

        return this.driveProviderForReservedRefund(
          reserved.refund.id,
          amount,
          reason,
          actorUserId,
        );
      },
    );
  }

  /**
   * Serialize per-order refund reservations with FOR UPDATE so concurrent
   * admins cannot breach the captured-value cap under Read Committed.
   */
  private async reserveRefundRow(
    orderId: string,
    amount: number,
    reason: string | undefined,
    idempotencyKey: string | undefined,
  ): Promise<{
    refund: {
      id: string;
      orderId: string;
      status: RefundStatus;
      amount: Prisma.Decimal;
      providerRef: string | null;
      transactionReference: string | null;
      idempotencyKey: string | null;
    };
    paymentProviderRef: string;
    reused?: boolean;
  }> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM "orders" WHERE id = ${orderId} FOR UPDATE
      `;

      // Re-check under the order lock so concurrent identical keys share one row.
      if (idempotencyKey) {
        const existing = await tx.refund.findUnique({
          where: { idempotencyKey },
        });
        if (existing) {
          const payment = await tx.payment.findFirst({
            where: {
              orderId,
              status: PaymentStatus.SUCCEEDED,
              providerRef: { not: null },
            },
            orderBy: { createdAt: 'asc' },
          });
          return {
            refund: existing,
            paymentProviderRef:
              payment?.providerRef ?? existing.transactionReference ?? '',
            reused: true,
          };
        }
      }

      const order = await tx.order.findUnique({
        where: { id: orderId },
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
        select: { amount: true },
      });
      const committed = prior.reduce((sum, r) => sum + money(r.amount), 0);
      if (committed + amount > captured + 1e-9) {
        throw new BadRequestException(
          `Refund would exceed captured value: committed=${committed}, request=${amount}, captured=${captured}`,
        );
      }

      try {
        const refund = await tx.refund.create({
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
        });
        return {
          refund,
          paymentProviderRef: payment.providerRef,
        };
      } catch (error) {
        if (isUniqueConstraintError(error) && idempotencyKey) {
          const raced = await tx.refund.findUnique({
            where: { idempotencyKey },
          });
          if (raced) {
            return {
              refund: raced,
              paymentProviderRef: payment.providerRef,
              reused: true,
            };
          }
        }
        throw error;
      }
    });
  }

  private async driveProviderForReservedRefund(
    refundId: string,
    amount: number,
    reason: string | undefined,
    actorUserId: string | undefined,
  ) {
    // Single-flight: claim the drive under a row lock so concurrent identical
    // retries cannot both POST to Paystack for the same reservation.
    const claim = await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`
        SELECT id FROM "refunds" WHERE id = ${refundId} FOR UPDATE
      `;
      const row = await tx.refund.findUniqueOrThrow({
        where: { id: refundId },
        include: { payment: true },
      });
      if (
        row.status !== RefundStatus.INITIATED ||
        (row.providerRef != null && !row.providerRef.startsWith('driving:'))
      ) {
        return { skip: true as const, refund: row };
      }
      const staleDriving =
        row.providerRef?.startsWith('driving:') &&
        row.updatedAt.getTime() < Date.now() - STALE_INITIATED_MS;
      if (row.providerRef?.startsWith('driving:') && !staleDriving) {
        return { skip: true as const, refund: row };
      }
      await tx.refund.update({
        where: { id: refundId },
        data: { providerRef: `driving:${refundId}` },
      });
      return {
        skip: false as const,
        refund: { ...row, providerRef: `driving:${refundId}` },
      };
    });

    if (claim.skip) {
      this.observability.recordRefundSettlement('reused');
      this.observability.recordRefund({
        outcome:
          claim.refund.status === RefundStatus.FAILED ? 'failure' : 'success',
      });
      return claim.refund;
    }

    const refund = claim.refund;
    const transactionReference =
      refund.transactionReference ?? refund.payment?.providerRef;
    if (!transactionReference) {
      throw new BadRequestException(
        'Refund reservation is missing a payment transaction reference',
      );
    }

    try {
      const reservedAmount = money(refund.amount);
      const providerResult = await this.paystackRefundClient.createRefund({
        transactionReference,
        amountKobo: Math.round(reservedAmount * 100),
        customerNote: reason,
        merchantNote: reason,
        idempotencyKey: refund.idempotencyKey ?? refund.id,
      });

      const nextStatus = providerStatusToRefundStatus(
        providerResult.providerStatus,
      );
      const updated = await this.prisma.refund.updateMany({
        where: {
          id: refund.id,
          status: RefundStatus.INITIATED,
          providerRef: `driving:${refund.id}`,
        },
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
      if (updated.count !== 1) {
        return this.prisma.refund.findUniqueOrThrow({
          where: { id: refund.id },
        });
      }

      const current = await this.prisma.refund.findUniqueOrThrow({
        where: { id: refund.id },
      });

      await this.audit.log({
        eventName: 'admin.order.refund.initiated',
        action: AuditAction.REFUND,
        entityType: 'Refund',
        entityId: refund.id,
        actorUserId: actorUserId ?? null,
        before: { status: RefundStatus.INITIATED },
        after: {
          status: current.status,
          providerRef: current.providerRef,
          amount,
        },
        note: reason ?? 'Refund initiated with provider',
      });

      if (providerResult.providerStatus.toLowerCase() === 'processed') {
        await this.settleRefundProcessed({
          event: 'refund.processed',
          data: {
            id: Number.isFinite(Number(providerResult.providerRefundId))
              ? Number(providerResult.providerRefundId)
              : undefined,
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

      if (current.status === RefundStatus.FAILED) {
        this.observability.recordRefund({ outcome: 'failure' });
        this.observability.recordRefundSettlement('failed');
      } else {
        this.observability.recordRefund({ outcome: 'success' });
        this.observability.recordRefundSettlement('initiated');
      }

      return current;
    } catch (error) {
      if (error instanceof PaystackRefundTransientError) {
        await this.prisma.refund.updateMany({
          where: {
            id: refund.id,
            status: RefundStatus.INITIATED,
            providerRef: `driving:${refund.id}`,
          },
          data: { providerRef: null },
        });
        this.logger.warn(
          `Paystack refund transient failure for ${refund.id}: ${error.message}`,
        );
        this.observability.recordRefund({ outcome: 'failure' });
        this.observability.recordRefundSettlement('provider_transient');
        throw new ConflictException(
          'Refund provider is temporarily unavailable; retry the same request',
        );
      }

      if (error instanceof BadRequestException) {
        await this.prisma.refund.updateMany({
          where: {
            id: refund.id,
            status: RefundStatus.INITIATED,
            providerRef: `driving:${refund.id}`,
          },
          data: { status: RefundStatus.FAILED, providerRef: null },
        });
        this.observability.recordRefund({ outcome: 'failure' });
        this.observability.recordRefundSettlement('provider_rejected');
      }
      throw error;
    }
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
  ): Promise<RefundWithRelations | null> {
    const candidates: string[] = [];
    if (data.id != null) candidates.push(String(data.id));
    if (data.refund_reference) candidates.push(String(data.refund_reference));

    for (const providerRefundId of candidates) {
      const byRef = await this.prisma.refund.findFirst({
        where: {
          provider: PaymentProvider.PAYSTACK,
          providerRef: providerRefundId,
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

    const amountMajor = providerAmountMajor(data.amount);
    const matches = await this.prisma.refund.findMany({
      where: {
        transactionReference: txnRef,
        status: {
          in: [...IN_FLIGHT, RefundStatus.FAILED],
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
    if (matches.length === 1) return matches[0];
    if (matches.length > 1) {
      this.logger.error(
        `Ambiguous refund webhook match for txn=${txnRef} amount=${amountMajor}: ${matches.length} candidates`,
      );
      this.observability.recordRefundSettlement('unmatched');
    }
    return null;
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
    if (!IN_FLIGHT.has(refund.status)) {
      this.observability.recordRefundSettlement('stale');
      return true;
    }

    const next =
      event === 'refund.needs-attention'
        ? RefundStatus.NEEDS_ATTENTION
        : RefundStatus.PROCESSING;

    const updated = await this.prisma.refund.updateMany({
      where: {
        id: refund.id,
        status: { in: [...IN_FLIGHT] },
      },
      data: {
        status: next,
        providerRef:
          payload.data.id != null
            ? String(payload.data.id)
            : payload.data.refund_reference
              ? String(payload.data.refund_reference)
              : undefined,
        transactionReference: payload.data.transaction_reference ?? undefined,
      },
    });
    this.observability.recordRefundSettlement(
      updated.count === 1 ? 'status_updated' : 'stale',
    );
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
    if (refund.status === RefundStatus.SUCCEEDED || refund.settlementClaim) {
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

    const updated = await this.prisma.refund.updateMany({
      where: {
        id: refund.id,
        status: { in: [...IN_FLIGHT] },
      },
      data: {
        status: RefundStatus.FAILED,
        providerRef:
          payload.data.id != null
            ? String(payload.data.id)
            : (refund.providerRef ?? undefined),
      },
    });
    this.observability.recordRefundSettlement(
      updated.count === 1 ? 'failed' : 'stale',
    );
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
        : payload.data.refund_reference
          ? String(payload.data.refund_reference)
          : (refund.providerRef ?? refund.id);
    const businessKey = `refund.processed:${refund.id}:${providerRef}`;
    const amount = money(refund.amount);
    const currency = (refund.order.currency as 'NGN') ?? DEFAULT_CURRENCY;
    const order = refund.order;
    const captured = money(refund.payment?.amount ?? order.totalAmount);

    const providerMajor = providerAmountMajor(payload.data.amount);
    if (providerMajor != null && Math.abs(providerMajor - amount) > 0.009) {
      this.logger.error(
        `refund.processed amount mismatch for ${refund.id}: local=${amount} providerMajor=${providerMajor}`,
      );
      await this.prisma.refund.updateMany({
        where: {
          id: refund.id,
          status: { in: [...IN_FLIGHT, RefundStatus.FAILED] },
        },
        data: { status: RefundStatus.NEEDS_ATTENTION, providerRef },
      });
      this.observability.recordRefundSettlement('rejected');
      await this.adminNotify.emit(ADMIN_NOTIF_REFUND_COMPLETED, {
        orderId: order.id,
        amount,
        currency,
        reason: `Provider/local amount mismatch: provider=${providerMajor} local=${amount}`,
        refundId: refund.id,
      });
      return true;
    }
    if (
      payload.data.currency != null &&
      payload.data.currency !== order.currency
    ) {
      this.logger.error(
        `refund.processed currency mismatch for ${refund.id}: local=${order.currency} provider=${payload.data.currency}`,
      );
      await this.prisma.refund.updateMany({
        where: {
          id: refund.id,
          status: { in: [...IN_FLIGHT, RefundStatus.FAILED] },
        },
        data: { status: RefundStatus.NEEDS_ATTENTION, providerRef },
      });
      this.observability.recordRefundSettlement('rejected');
      return true;
    }

    let notificationId: string | undefined;

    try {
      await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`
          SELECT id FROM "orders" WHERE id = ${order.id} FOR UPDATE
        `;
        const lockedOrder = await tx.order.findUniqueOrThrow({
          where: { id: order.id },
        });

        await tx.refundSettlementClaim.create({
          data: {
            provider: refund.provider ?? PaymentProvider.PAYSTACK,
            businessKey,
            refundId: refund.id,
            orderId: order.id,
          },
        });

        // Provider-confirmed success may reconcile a prior local FAILED.
        const statusUpdate = await tx.refund.updateMany({
          where: {
            id: refund.id,
            status: {
              in: [
                RefundStatus.INITIATED,
                RefundStatus.PROCESSING,
                RefundStatus.NEEDS_ATTENTION,
                RefundStatus.FAILED,
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
          const current = await tx.refund.findUnique({
            where: { id: refund.id },
            include: { settlementClaim: true },
          });
          if (
            current?.status === RefundStatus.SUCCEEDED ||
            current?.settlementClaim
          ) {
            return;
          }
          throw new Error(
            `refund.processed claim won but refund ${refund.id} could not transition`,
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
        const nextOrderStatus = deriveOrderStatusAfterRefund(
          lockedOrder.status,
          succeededSum,
          captured,
        );

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
        const claim = await this.prisma.refundSettlementClaim.findUnique({
          where: { refundId: refund.id },
        });
        if (claim) {
          this.observability.recordRefundSettlement('duplicate');
          return true;
        }
        this.logger.error(
          `Unique constraint during refund settlement for ${refund.id} without local claim`,
        );
        this.observability.recordRefundSettlement('rejected');
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

  /**
   * Clear stale driving: claims so retries can re-drive without releasing the
   * captured-value cap. Ambiguous INITIATED (null providerRef) rows escalate to
   * NEEDS_ATTENTION and remain in-flight for the cap until an operator or
   * provider webhook resolves them (TTW-013 review 2).
   */
  async clearStaleDriveClaims(now = new Date()): Promise<number> {
    const cutoff = new Date(now.getTime() - STALE_INITIATED_MS);
    const result = await this.prisma.refund.updateMany({
      where: {
        status: RefundStatus.INITIATED,
        providerRef: { startsWith: 'driving:' },
        updatedAt: { lt: cutoff },
      },
      data: { providerRef: null },
    });
    if (result.count > 0) {
      this.observability.recordRefundSettlement('stale');
      this.logger.warn(`Cleared ${result.count} stale refund drive claims`);
    }
    return result.count;
  }

  /**
   * Escalate long-lived ambiguous INITIATED rows to NEEDS_ATTENTION without
   * releasing the cumulative captured-value reservation.
   */
  async failStaleInitiatedRefunds(now = new Date()): Promise<number> {
    const cleared = await this.clearStaleDriveClaims(now);
    const cutoff = new Date(now.getTime() - STALE_INITIATED_MS);
    const result = await this.prisma.refund.updateMany({
      where: {
        status: RefundStatus.INITIATED,
        providerRef: null,
        updatedAt: { lt: cutoff },
      },
      data: { status: RefundStatus.NEEDS_ATTENTION },
    });
    if (result.count > 0) {
      this.observability.recordRefundSettlement('status_updated');
      this.logger.warn(
        `Escalated ${result.count} stale INITIATED refunds to NEEDS_ATTENTION`,
      );
    }
    return cleared + result.count;
  }
}
