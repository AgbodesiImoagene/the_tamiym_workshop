import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { ObservabilityService } from '../observability/observability.service';
import {
  OrderStatus,
  PaymentStatus,
  PaymentProvider,
} from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { DEFAULT_CURRENCY } from '../constants';
import {
  PaystackTransactionClient,
  PaystackTransientError,
} from './paystack-transaction.client';

export type PaymentInitiationOutcome =
  | 'created'
  | 'reused'
  | 'reconciled'
  | 'blocked'
  | 'failure';

export type InitiatePaymentResult = {
  authorizationUrl: string;
  reference: string;
  accessCode: string;
  attemptOutcome: Exclude<PaymentInitiationOutcome, 'blocked' | 'failure'>;
};

type InitContext = {
  email: string;
  amountKobo: number;
  callbackUrl: string;
  orderId: string;
};

const ACTIVE_STATUSES: PaymentStatus[] = [
  PaymentStatus.PENDING,
  PaymentStatus.INITIATED,
];

/**
 * After this age, a PENDING row may attempt one same-ref initialize (lost-response
 * reconcile). Must exceed Paystack initialize timeout (20s) so we never re-enter
 * the provider while the reserve winner is still in flight.
 */
const PENDING_RECONCILE_AFTER_MS = 25_000;
const PENDING_STALE_MS = 45_000;
const PENDING_POLL_ATTEMPTS = 20;
const PENDING_POLL_DELAY_MS = 50;

function isUniqueConstraintError(error: unknown): boolean {
  return (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    error.code === 'P2002'
  );
}

function newAttemptSuffix(): string {
  return randomBytes(6).toString('hex');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isDuplicateReferenceMessage(message: string): boolean {
  const m = message.toLowerCase();
  return m.includes('duplicate') && m.includes('reference');
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private observability: ObservabilityService,
    private paystack: PaystackTransactionClient,
  ) {}

  private attemptTtlMs(): number {
    const minutes = Number(
      this.config.get<string>('PAYMENT_ATTEMPT_TTL_MINUTES') ?? '30',
    );
    const safe = Number.isFinite(minutes) && minutes > 0 ? minutes : 30;
    return safe * 60_000;
  }

  /**
   * Initiate Paystack payment for an order. At most one active attempt per order
   * (TTW-012). Only the DB-reserve winner (or a same-ref reconcile) calls Paystack.
   */
  async initiatePayment(
    orderId: string,
    userId: string,
    customerEmail: string | undefined,
  ): Promise<InitiatePaymentResult> {
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
        const amountKobo = Math.round(Number(order.totalAmount) * 100);
        if (amountKobo <= 0) {
          throw new BadRequestException(
            'Order total must be greater than zero',
          );
        }

        const email = customerEmail || order.user?.email;
        if (!email) {
          throw new BadRequestException('Customer email is required');
        }

        const callbackUrl = this.config.get<string>(
          'PAYSTACK_CALLBACK_URL',
          `${this.config.get('APP_URL', 'http://localhost:3000')}/orders/${orderId}/confirm`,
        );

        const ctx: InitContext = {
          email,
          amountKobo,
          callbackUrl,
          orderId,
        };

        for (let attempt = 0; attempt < 5; attempt++) {
          const resolved = await this.resolveActiveAttempt(orderId, ctx);
          if (resolved) {
            return resolved;
          }

          const providerRef = `ord-${orderId}-${newAttemptSuffix()}`;
          const expiresAt = new Date(Date.now() + this.attemptTtlMs());

          try {
            await this.prisma.payment.create({
              data: {
                orderId,
                provider: PaymentProvider.PAYSTACK,
                providerRef,
                status: PaymentStatus.PENDING,
                currency: DEFAULT_CURRENCY,
                amount: order.totalAmount,
                idempotencyKey: providerRef,
                expiresAt,
              },
            });
          } catch (error) {
            if (isUniqueConstraintError(error)) {
              continue;
            }
            throw error;
          }

          return this.completeInitialize(orderId, providerRef, ctx, 'created');
        }

        this.observability.recordPaymentInitiation({ outcome: 'blocked' });
        throw new ConflictException(
          'Could not reserve a payment attempt. Retry shortly.',
        );
      },
    );
  }

  private async completeInitialize(
    orderId: string,
    providerRef: string,
    ctx: InitContext,
    outcome: 'created' | 'reconciled',
  ): Promise<InitiatePaymentResult> {
    try {
      const init = await this.paystack.initialize({
        email: ctx.email,
        amountKobo: ctx.amountKobo,
        reference: providerRef,
        callbackUrl: ctx.callbackUrl,
        metadata: { orderId },
        idempotencyKey: providerRef,
      });
      const persisted = await this.persistInitiated(orderId, providerRef, init);
      if (!persisted) {
        this.observability.recordPaymentInitiation({ outcome: 'blocked' });
        throw new ConflictException(
          'Payment attempt changed during initialization. Retry shortly.',
        );
      }
      this.observability.recordPaymentInitiation({ outcome });
      return {
        authorizationUrl: init.authorizationUrl,
        reference: init.reference,
        accessCode: init.accessCode,
        attemptOutcome: outcome,
      };
    } catch (error) {
      if (error instanceof ConflictException) {
        throw error;
      }
      if (error instanceof PaystackTransientError) {
        this.logger.warn(
          `Payment initialize transient for ${providerRef}: ${error.message}`,
        );
        this.observability.recordPaymentInitiation({ outcome: 'blocked' });
        throw new ConflictException(
          'Payment initialization is in progress. Retry shortly to resume the same attempt.',
        );
      }
      if (error instanceof BadRequestException) {
        const message = error.message ?? '';
        if (isDuplicateReferenceMessage(message)) {
          // Same-ref replay while another call owns the session — do not wipe.
          this.observability.recordPaymentInitiation({ outcome: 'blocked' });
          throw new ConflictException(
            'Payment initialization is in progress. Retry shortly to resume the same attempt.',
          );
        }
        await this.markAttemptFailed(providerRef, { reason: message });
        this.observability.recordPaymentInitiation({ outcome: 'failure' });
        throw error;
      }
      this.logger.warn(
        `Payment initialize left PENDING for ${providerRef}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      this.observability.recordPaymentInitiation({ outcome: 'blocked' });
      throw new ConflictException(
        'Payment initialization is in progress. Retry shortly to resume the same attempt.',
      );
    }
  }

  /**
   * Attach to an existing active attempt. Concurrent observers poll only.
   * After PENDING_RECONCILE_AFTER_MS, one same-ref initialize may recover a
   * lost provider response. Stale PENDING (>45s) is failed for a new attempt.
   */
  private async resolveActiveAttempt(
    orderId: string,
    ctx: InitContext,
  ): Promise<InitiatePaymentResult | null> {
    let active = await this.prisma.payment.findFirst({
      where: { orderId, status: { in: ACTIVE_STATUSES } },
    });
    if (!active) return null;

    if (this.isExpired(active)) {
      await this.failIfStillPendingOrInitiated(active.id);
      return null;
    }

    if (
      active.status === PaymentStatus.INITIATED &&
      active.authorizationUrl &&
      active.accessCode &&
      active.providerRef
    ) {
      this.observability.recordPaymentInitiation({ outcome: 'reused' });
      return {
        authorizationUrl: active.authorizationUrl,
        reference: active.providerRef,
        accessCode: active.accessCode,
        attemptOutcome: 'reused',
      };
    }

    if (this.isPendingStale(active)) {
      await this.failIfStillPending(active.id, {
        reason: 'PENDING attempt stale; allowing a new attempt',
      });
      return null;
    }

    for (let i = 0; i < PENDING_POLL_ATTEMPTS; i++) {
      await sleep(PENDING_POLL_DELAY_MS);
      active = await this.prisma.payment.findFirst({
        where: { orderId, status: { in: ACTIVE_STATUSES } },
      });
      if (!active) return null;
      if (this.isExpired(active)) {
        await this.failIfStillPendingOrInitiated(active.id);
        return null;
      }
      if (this.isPendingStale(active)) {
        await this.failIfStillPending(active.id, {
          reason: 'PENDING attempt stale; allowing a new attempt',
        });
        return null;
      }
      if (
        active.status === PaymentStatus.INITIATED &&
        active.authorizationUrl &&
        active.accessCode &&
        active.providerRef
      ) {
        this.observability.recordPaymentInitiation({ outcome: 'reused' });
        return {
          authorizationUrl: active.authorizationUrl,
          reference: active.providerRef,
          accessCode: active.accessCode,
          attemptOutcome: 'reused',
        };
      }
    }

    // Lost-response reconcile: same providerRef / Idempotency-Key only.
    active = await this.prisma.payment.findFirst({
      where: { orderId, status: PaymentStatus.PENDING },
    });
    if (
      active?.providerRef &&
      Date.now() - active.createdAt.getTime() >= PENDING_RECONCILE_AFTER_MS
    ) {
      return this.completeInitialize(
        orderId,
        active.providerRef,
        ctx,
        'reconciled',
      );
    }

    this.observability.recordPaymentInitiation({ outcome: 'blocked' });
    throw new ConflictException(
      'Payment initialization is in progress. Retry shortly to resume the same attempt.',
    );
  }

  private async failIfStillPending(
    id: string,
    metadata: Record<string, string>,
  ): Promise<void> {
    await this.prisma.payment.updateMany({
      where: { id, status: PaymentStatus.PENDING },
      data: {
        status: PaymentStatus.FAILED,
        rawEvent: metadata as Prisma.InputJsonValue,
      },
    });
  }

  private async failIfStillPendingOrInitiated(id: string): Promise<void> {
    await this.prisma.payment.updateMany({
      where: { id, status: { in: ACTIVE_STATUSES } },
      data: { status: PaymentStatus.FAILED },
    });
  }

  private isExpired(payment: {
    expiresAt: Date | null;
    createdAt?: Date;
  }): boolean {
    if (payment.expiresAt != null) {
      return payment.expiresAt.getTime() <= Date.now();
    }
    if (payment.createdAt) {
      return payment.createdAt.getTime() + this.attemptTtlMs() <= Date.now();
    }
    return true;
  }

  private isPendingStale(payment: {
    status: PaymentStatus;
    createdAt: Date;
  }): boolean {
    return (
      payment.status === PaymentStatus.PENDING &&
      Date.now() - payment.createdAt.getTime() >= PENDING_STALE_MS
    );
  }

  private async persistInitiated(
    orderId: string,
    providerRef: string,
    init: {
      authorizationUrl: string;
      reference: string;
      accessCode: string;
    },
  ): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.payment.updateMany({
        where: {
          orderId,
          providerRef,
          status: { in: ACTIVE_STATUSES },
        },
        data: {
          status: PaymentStatus.INITIATED,
          providerRef: init.reference,
          authorizationUrl: init.authorizationUrl,
          accessCode: init.accessCode,
        },
      });
      if (updated.count !== 1) {
        return false;
      }
      await tx.order.update({
        where: { id: orderId },
        data: { paymentReference: init.reference },
      });
      return true;
    });
  }

  private async markAttemptFailed(
    providerRef: string,
    metadata: Record<string, string>,
  ): Promise<void> {
    // PENDING only — never wipe an INITIATED checkout session from a racing reconcile.
    await this.prisma.payment.updateMany({
      where: {
        providerRef,
        status: PaymentStatus.PENDING,
      },
      data: {
        status: PaymentStatus.FAILED,
        rawEvent: metadata as Prisma.InputJsonValue,
      },
    });
  }
}
