import { RefundReasonCode } from '../src/orders/resolution-policy';
import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { RefundsService } from '../src/orders/refunds.service';
import { PaystackRefundClient } from '../src/orders/paystack-refund.client';
import {
  CampaignStatus,
  LedgerEntryType,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  RefundStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

/**
 * TTW-013: refunds settle exactly once under duplicate/concurrent delivery;
 * partial refunds leave PARTIALLY_REFUNDED until the captured value is covered.
 */
describe('Paystack refund lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let refunds: RefundsService;
  let paystackRefundClient: PaystackRefundClient;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    refunds = app.get(RefundsService);
    paystackRefundClient = app.get(PaystackRefundClient);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function createPaidCampaignOrder(suffix: string, totalAmount = 10_000) {
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const organizer = await prisma.user.create({
      data: {
        email: `org-refund-${suffix}@example.com`,
        passwordHash,
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        firstName: 'Org',
        lastName: 'Refund',
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: `cust-refund-${suffix}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Cust',
        lastName: 'Refund',
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizerId: organizer.id,
        title: `Refund ${suffix}`,
        slug: `refund-${suffix}`,
        status: CampaignStatus.ACTIVE,
        currentAmount: totalAmount,
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
        status: OrderStatus.PAID,
        paymentStatus: PaymentStatus.SUCCEEDED,
        currency: 'NGN',
        subtotalAmount: totalAmount,
        totalAmount,
        shipLine1: address.addressLine1,
        shipCity: address.city,
        shipState: address.state,
        shipCountry: 'Nigeria',
        campaignId: campaign.id,
      },
    });
    const providerRef = `psk_ttw013_${suffix}`;
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: PaymentProvider.PAYSTACK,
        providerRef,
        status: PaymentStatus.SUCCEEDED,
        currency: 'NGN',
        amount: totalAmount,
        idempotencyKey: providerRef,
      },
    });

    return {
      organizer,
      customer,
      campaign,
      order,
      payment,
      providerRef,
      totalAmount,
    };
  }

  it('keeps order PAID until refund.processed then settles once under concurrent webhooks', async () => {
    const suffix = `conc-${Date.now()}`;
    const { order, campaign, payment, providerRef, totalAmount } =
      await createPaidCampaignOrder(suffix);

    let providerCalls = 0;
    jest
      .spyOn(paystackRefundClient, 'createRefund')
      .mockImplementation(async () => {
        providerCalls += 1;
        await Promise.resolve();
        return {
          providerRefundId: `9001${suffix.slice(-4)}`,
          providerStatus: 'pending',
          refundReference: null,
          transactionReference: providerRef,
          amountKobo: Math.round(totalAmount * 100),
          currency: 'NGN',
        };
      });

    const initiated = await refunds.initiateRefund(
      order.id,
      totalAmount,
      RefundReasonCode.ADMIN_GOODWILL,
      'full refund',
      undefined,
      `idem-${suffix}`,
    );
    expect(initiated.status).toBe(RefundStatus.PROCESSING);
    expect(providerCalls).toBe(1);

    const orderAfterInit = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(orderAfterInit.status).toBe(OrderStatus.PAID);

    const ledgerBefore = await prisma.campaignBalanceLedgerEntry.count({
      where: {
        refundId: initiated.id,
        entryType: LedgerEntryType.REFUND_APPLIED,
      },
    });
    expect(ledgerBefore).toBe(0);

    const payload = {
      event: 'refund.processed' as const,
      data: {
        id: Number(initiated.providerRef),
        status: 'processed',
        amount: Math.round(totalAmount * 100),
        currency: 'NGN',
        transaction_reference: providerRef,
      },
    };

    await Promise.all(
      Array.from({ length: 25 }, () =>
        refunds.applyRefundWebhookEvent(payload),
      ),
    );

    const refund = await prisma.refund.findUniqueOrThrow({
      where: { id: initiated.id },
      include: { settlementClaim: true },
    });
    expect(refund.status).toBe(RefundStatus.SUCCEEDED);
    expect(refund.settlementClaim).toBeTruthy();

    const claims = await prisma.refundSettlementClaim.count({
      where: { refundId: initiated.id },
    });
    expect(claims).toBe(1);

    const ledgerRows = await prisma.campaignBalanceLedgerEntry.count({
      where: {
        refundId: initiated.id,
        entryType: LedgerEntryType.REFUND_APPLIED,
      },
    });
    expect(ledgerRows).toBe(1);

    const updatedOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updatedOrder.status).toBe(OrderStatus.REFUNDED);

    const updatedCampaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: campaign.id },
    });
    expect(Number(updatedCampaign.currentAmount)).toBe(0);

    // payment id used so unused var warning avoided in strict setups
    expect(payment.id).toBeTruthy();
  });

  it('marks PARTIALLY_REFUNDED for a partial confirmed refund', async () => {
    const suffix = `partial-${Date.now()}`;
    const { order, providerRef, totalAmount } = await createPaidCampaignOrder(
      suffix,
      10_000,
    );

    jest.spyOn(paystackRefundClient, 'createRefund').mockResolvedValue({
      providerRefundId: `8001${suffix.slice(-4)}`,
      providerStatus: 'pending',
      refundReference: null,
      transactionReference: providerRef,
      amountKobo: 250_000,
      currency: 'NGN',
    });

    const initiated = await refunds.initiateRefund(
      order.id,
      2500,
      RefundReasonCode.ADMIN_GOODWILL,
      'partial',
    );
    await refunds.applyRefundWebhookEvent({
      event: 'refund.processed',
      data: {
        id: Number(initiated.providerRef),
        status: 'processed',
        amount: 250000,
        currency: 'NGN',
        transaction_reference: providerRef,
      },
    });

    const updated = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(updated.status).toBe(OrderStatus.PARTIALLY_REFUNDED);
    expect(totalAmount).toBe(10_000);
  });

  it('rejects a second initiation that would exceed captured value', async () => {
    const suffix = `cap-${Date.now()}`;
    const { order, providerRef } = await createPaidCampaignOrder(suffix, 5_000);

    jest.spyOn(paystackRefundClient, 'createRefund').mockResolvedValue({
      providerRefundId: `7001${suffix.slice(-4)}`,
      providerStatus: 'pending',
      refundReference: null,
      transactionReference: providerRef,
      amountKobo: 400_000,
      currency: 'NGN',
    });

    await refunds.initiateRefund(
      order.id,
      4000,
      RefundReasonCode.ADMIN_GOODWILL,
      'first',
    );
    await expect(
      refunds.initiateRefund(
        order.id,
        2000,
        RefundReasonCode.ADMIN_GOODWILL,
        'over',
      ),
    ).rejects.toThrow(/exceed captured value|between 0/i);
  });

  it('serializes concurrent full-amount initiations under the captured-value cap', async () => {
    const suffix = `race-${Date.now()}`;
    const { order, providerRef, totalAmount } = await createPaidCampaignOrder(
      suffix,
      10_000,
    );

    let providerCalls = 0;
    jest
      .spyOn(paystackRefundClient, 'createRefund')
      .mockImplementation(async () => {
        providerCalls += 1;
        await new Promise((r) => setTimeout(r, 15));
        return {
          providerRefundId: `6000${providerCalls}${suffix.slice(-3)}`,
          providerStatus: 'pending',
          refundReference: null,
          transactionReference: providerRef,
          amountKobo: Math.round(totalAmount * 100),
          currency: 'NGN',
        };
      });

    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        refunds.initiateRefund(
          order.id,
          totalAmount,
          RefundReasonCode.ADMIN_GOODWILL,
          `race-${i}`,
          undefined,
          `idem-race-${suffix}-${i}`,
        ),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    expect(fulfilled.length).toBe(1);
    expect(rejected.length).toBe(7);
    expect(providerCalls).toBe(1);

    const rows = await prisma.refund.findMany({
      where: {
        orderId: order.id,
        status: {
          in: [
            RefundStatus.INITIATED,
            RefundStatus.PROCESSING,
            RefundStatus.NEEDS_ATTENTION,
            RefundStatus.SUCCEEDED,
          ],
        },
      },
    });
    const inFlightTotal = rows.reduce((sum, r) => sum + Number(r.amount), 0);
    expect(inFlightTotal).toBe(totalAmount);
  });

  it('single-flights concurrent identical idempotency-key retries to one provider call', async () => {
    const suffix = `samekey-${Date.now()}`;
    const { order, providerRef, totalAmount } = await createPaidCampaignOrder(
      suffix,
      8_000,
    );

    let providerCalls = 0;
    jest
      .spyOn(paystackRefundClient, 'createRefund')
      .mockImplementation(async () => {
        providerCalls += 1;
        await new Promise((r) => setTimeout(r, 40));
        return {
          providerRefundId: `5500${suffix.slice(-4)}`,
          providerStatus: 'pending',
          refundReference: null,
          transactionReference: providerRef,
          amountKobo: Math.round(totalAmount * 100),
          currency: 'NGN',
        };
      });

    const key = `idem-same-${suffix}`;
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        refunds.initiateRefund(
          order.id,
          totalAmount,
          RefundReasonCode.ADMIN_GOODWILL,
          'same',
          undefined,
          key,
        ),
      ),
    );

    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    expect(fulfilled.length).toBe(6);
    expect(providerCalls).toBe(1);

    const rows = await prisma.refund.findMany({ where: { orderId: order.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].providerRef).toBe(`5500${suffix.slice(-4)}`);
  });
});
