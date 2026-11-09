import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaystackWebhookService } from '../src/orders/paystack-webhook.service';
import { RefundsService } from '../src/orders/refunds.service';
import {
  PaystackRefundClient,
  PaystackRefundTransientError,
} from '../src/orders/paystack-refund.client';
import { RefundReasonCode } from '../src/orders/resolution-policy';
import {
  CampaignStatus,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  RefundStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

let providerRefundIdSeq = 0;

/** Unique across runs: the e2e database is never emptied (see the TTW-013 suite). */
function uniqueProviderRefundId(): string {
  providerRefundIdSeq += 1;
  return String(Date.now() * 1000 + providerRefundIdSeq);
}

/**
 * TTW-088: a payment captured after the order was cancelled (bank transfer or
 * USSD settling after the 30 min window) is recorded once, never pays the
 * order, and can be refunded by an admin exactly once.
 */
describe('Late payment on a cancelled order (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let webhooks: PaystackWebhookService;
  let refunds: RefundsService;
  let paystackRefundClient: PaystackRefundClient;

  const TOTAL = 10_000;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    webhooks = app.get(PaystackWebhookService);
    refunds = app.get(RefundsService);
    paystackRefundClient = app.get(PaystackRefundClient);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function createCancelledCampaignOrder(
    suffix: string,
    opts: { expiredPending?: boolean } = {},
  ) {
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const organizer = await prisma.user.create({
      data: {
        email: `org-late-${suffix}@example.com`,
        passwordHash,
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        firstName: 'Org',
        lastName: 'Late',
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: `cust-late-${suffix}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Cust',
        lastName: 'Late',
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizerId: organizer.id,
        title: `Late ${suffix}`,
        slug: `late-${suffix}`,
        status: CampaignStatus.ACTIVE,
        currentAmount: 0,
      },
    });
    const address = await prisma.address.create({
      data: {
        userId: customer.id,
        addressLine1: '1 Test Street',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
      },
    });
    const order = await prisma.order.create({
      data: {
        userId: customer.id,
        shippingAddressId: address.id,
        status: opts.expiredPending
          ? OrderStatus.PENDING_PAYMENT
          : OrderStatus.CANCELLED,
        cancelledAt: opts.expiredPending ? null : new Date(),
        expiresAt: opts.expiredPending ? new Date(Date.now() - 60_000) : null,
        paymentStatus: PaymentStatus.PENDING,
        currency: 'NGN',
        subtotalAmount: TOTAL,
        totalAmount: TOTAL,
        shipLine1: address.addressLine1,
        shipCity: address.city,
        shipState: address.state,
        shipCountry: 'Nigeria',
        campaignId: campaign.id,
      },
    });
    const providerRef = `psk_ttw088_${suffix}`;
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: PaymentProvider.PAYSTACK,
        providerRef,
        status: PaymentStatus.INITIATED,
        currency: 'NGN',
        amount: TOTAL,
        idempotencyKey: providerRef,
      },
    });
    return { campaign, order, payment, providerRef };
  }

  function lateChargeEvent(providerRef: string, amountKobo = TOTAL * 100) {
    return {
      event: 'charge.success',
      data: {
        reference: providerRef,
        amount: amountKobo,
        currency: 'NGN',
        status: 'success',
      },
    };
  }

  async function campaignAndLedgerUntouched(campaignId: string) {
    const campaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: campaignId },
    });
    expect(Number(campaign.currentAmount)).toBe(0);
    const entries = await prisma.campaignBalanceLedgerEntry.count({
      where: { campaignId },
    });
    expect(entries).toBe(0);
  }

  it('records a late capture once under parallel duplicate webhooks without paying the order', async () => {
    const { order, payment, providerRef, campaign } =
      await createCancelledCampaignOrder(`rec-${Date.now()}`);

    await Promise.all(
      Array.from({ length: 20 }, () =>
        webhooks.processChargeSuccess(lateChargeEvent(providerRef)),
      ),
    );
    await webhooks.processChargeSuccess(lateChargeEvent(providerRef));

    const claims = await prisma.chargeSettlementClaim.count({
      where: { paymentId: payment.id },
    });
    expect(claims).toBe(1);
    const paymentAfter = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(paymentAfter.status).toBe(PaymentStatus.SUCCEEDED);
    const orderAfter = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(orderAfter.status).toBe(OrderStatus.CANCELLED);
    await campaignAndLedgerUntouched(campaign.id);
  });

  it('cancels an expired pending order and records its late capture, then refunds it once', async () => {
    const suffix = `exp-${Date.now()}`;
    const { order, payment, providerRef, campaign } =
      await createCancelledCampaignOrder(suffix, { expiredPending: true });

    await Promise.all(
      Array.from({ length: 10 }, () =>
        webhooks.processChargeSuccess(lateChargeEvent(providerRef)),
      ),
    );

    const orderAfter = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(orderAfter.status).toBe(OrderStatus.CANCELLED);
    const paymentAfter = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(paymentAfter.status).toBe(PaymentStatus.SUCCEEDED);
    expect(
      await prisma.chargeSettlementClaim.count({
        where: { paymentId: payment.id },
      }),
    ).toBe(1);
    await campaignAndLedgerUntouched(campaign.id);

    jest.spyOn(paystackRefundClient, 'createRefund').mockResolvedValue({
      providerRefundId: uniqueProviderRefundId(),
      providerStatus: 'pending',
      refundReference: null,
      transactionReference: providerRef,
      amountKobo: TOTAL * 100,
      currency: 'NGN',
    });
    const refund = await refunds.initiateRefund(
      order.id,
      TOTAL,
      RefundReasonCode.LATE_PAYMENT_AFTER_CANCELLATION,
    );
    expect(refund.status).toBe(RefundStatus.PROCESSING);
  });

  it('refuses the late refund when several captured payments exist', async () => {
    const { order, providerRef } = await createCancelledCampaignOrder(
      `multi-${Date.now()}`,
    );
    await webhooks.processChargeSuccess(lateChargeEvent(providerRef));
    const otherRef = `${providerRef}_b`;
    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: PaymentProvider.PAYSTACK,
        providerRef: otherRef,
        status: PaymentStatus.SUCCEEDED,
        currency: 'NGN',
        amount: TOTAL,
        idempotencyKey: otherRef,
      },
    });
    const spy = jest.spyOn(paystackRefundClient, 'createRefund');

    await expect(
      refunds.initiateRefund(
        order.id,
        TOTAL,
        RefundReasonCode.LATE_PAYMENT_AFTER_CANCELLATION,
      ),
    ).rejects.toBeDefined();

    expect(spy).not.toHaveBeenCalled();
    expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('records nothing when the late capture has a different amount', async () => {
    const { payment, providerRef } = await createCancelledCampaignOrder(
      `mis-${Date.now()}`,
    );

    await webhooks.processChargeSuccess(
      lateChargeEvent(providerRef, (TOTAL - 1) * 100),
    );

    const paymentAfter = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
    });
    expect(paymentAfter.status).toBe(PaymentStatus.INITIATED);
    expect(
      await prisma.chargeSettlementClaim.count({
        where: { paymentId: payment.id },
      }),
    ).toBe(0);
  });

  it('refunds a recorded late payment exactly once under sequential and parallel duplicates, then settles once', async () => {
    const suffix = `ref-${Date.now()}`;
    const { order, payment, providerRef, campaign } =
      await createCancelledCampaignOrder(suffix);
    await webhooks.processChargeSuccess(lateChargeEvent(providerRef));

    const providerRefundId = uniqueProviderRefundId();
    let providerCalls = 0;
    jest
      .spyOn(paystackRefundClient, 'createRefund')
      .mockImplementation(async () => {
        providerCalls += 1;
        await Promise.resolve();
        return {
          providerRefundId,
          providerStatus: 'pending',
          refundReference: null,
          transactionReference: providerRef,
          amountKobo: TOTAL * 100,
          currency: 'NGN',
        };
      });

    const attempt = (key?: string) =>
      refunds.initiateRefund(
        order.id,
        TOTAL,
        RefundReasonCode.LATE_PAYMENT_AFTER_CANCELLATION,
        'paid after the 30 min window',
        undefined,
        key,
      );

    // Parallel duplicates, with and without an idempotency key.
    const results = await Promise.allSettled([
      ...Array.from({ length: 6 }, () => attempt(`idem-${suffix}`)),
      ...Array.from({ length: 6 }, () => attempt()),
    ]);
    // Sequential duplicate afterwards.
    await attempt(`idem-${suffix}`).catch(() => undefined);

    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    const rows = await prisma.refund.findMany({
      where: { orderId: order.id },
    });
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].amount)).toBe(TOTAL);
    expect(rows[0].paymentId).toBe(payment.id);
    expect(providerCalls).toBe(1);

    const refundId = rows[0].id;
    const initiated = await prisma.refund.findUniqueOrThrow({
      where: { id: refundId },
    });
    const payload = {
      event: 'refund.processed' as const,
      data: {
        id: Number(initiated.providerRef),
        status: 'processed',
        amount: TOTAL * 100,
        currency: 'NGN',
        transaction_reference: providerRef,
      },
    };
    await Promise.all(
      Array.from({ length: 20 }, () =>
        refunds.applyRefundWebhookEvent(payload),
      ),
    );

    const settled = await prisma.refund.findUniqueOrThrow({
      where: { id: refundId },
      include: { settlementClaim: true },
    });
    expect(settled.status).toBe(RefundStatus.SUCCEEDED);
    expect(settled.settlementClaim).not.toBeNull();
    const orderAfter = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(orderAfter.status).toBe(OrderStatus.REFUNDED);
    // The payment was never credited to the campaign, so nothing is reversed.
    await campaignAndLedgerUntouched(campaign.id);

    // A further refund of the same payment is refused.
    await expect(attempt()).rejects.toBeDefined();
    expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(1);
  });

  it('refuses a partial amount for the late-payment case', async () => {
    const { order, providerRef } = await createCancelledCampaignOrder(
      `part-${Date.now()}`,
    );
    await webhooks.processChargeSuccess(lateChargeEvent(providerRef));
    const spy = jest.spyOn(paystackRefundClient, 'createRefund');

    await expect(
      refunds.initiateRefund(
        order.id,
        TOTAL / 2,
        RefundReasonCode.LATE_PAYMENT_AFTER_CANCELLATION,
      ),
    ).rejects.toBeDefined();

    expect(spy).not.toHaveBeenCalled();
    expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('keeps a cancelled order without captured money non-refundable', async () => {
    const { order } = await createCancelledCampaignOrder(`none-${Date.now()}`);
    const spy = jest.spyOn(paystackRefundClient, 'createRefund');

    for (const reasonCode of [
      RefundReasonCode.LATE_PAYMENT_AFTER_CANCELLATION,
      RefundReasonCode.ADMIN_GOODWILL,
    ]) {
      await expect(
        refunds.initiateRefund(order.id, TOTAL, reasonCode),
      ).rejects.toBeDefined();
    }

    expect(spy).not.toHaveBeenCalled();
    expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(0);
  });

  it('keeps the refund retryable when Paystack times out, then settles once on retry', async () => {
    const suffix = `retry-${Date.now()}`;
    const { order, providerRef } = await createCancelledCampaignOrder(suffix);
    await webhooks.processChargeSuccess(lateChargeEvent(providerRef));

    const providerRefundId = uniqueProviderRefundId();
    const spy = jest
      .spyOn(paystackRefundClient, 'createRefund')
      .mockRejectedValueOnce(new PaystackRefundTransientError('timeout'))
      .mockResolvedValue({
        providerRefundId,
        providerStatus: 'pending',
        refundReference: null,
        transactionReference: providerRef,
        amountKobo: TOTAL * 100,
        currency: 'NGN',
      });

    const key = `idem-${suffix}`;
    const call = () =>
      refunds.initiateRefund(
        order.id,
        TOTAL,
        RefundReasonCode.LATE_PAYMENT_AFTER_CANCELLATION,
        undefined,
        undefined,
        key,
      );

    await expect(call()).rejects.toBeDefined();
    const afterTimeout = await prisma.refund.findMany({
      where: { orderId: order.id },
    });
    expect(afterTimeout).toHaveLength(1);
    expect(afterTimeout[0].status).toBe(RefundStatus.INITIATED);

    const retried = await call();
    expect(retried.status).toBe(RefundStatus.PROCESSING);
    expect(spy).toHaveBeenCalledTimes(2);
    expect(await prisma.refund.count({ where: { orderId: order.id } })).toBe(1);
  });
});
