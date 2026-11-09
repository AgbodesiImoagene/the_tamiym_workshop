import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaystackWebhookService } from '../src/orders/paystack-webhook.service';
import { AdminNotifyService } from '../src/admin-notifications/admin-notify.service';
import {
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

/**
 * TTW-189 / TTW-190: a second payment captured for an order that is already
 * paid is recorded once (a settlement claim, Payment.status unchanged), never
 * changes the order, and reports exactly one admin notification.
 */
describe('Extra payment capture on a paid order (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let webhooks: PaystackWebhookService;
  let adminNotify: AdminNotifyService;

  const TOTAL = 10_000;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    webhooks = app.get(PaystackWebhookService);
    adminNotify = app.get(AdminNotifyService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  /** Order with two attempts: A (expired, INITIATED) and B (INITIATED). */
  async function createOrderWithTwoAttempts(suffix: string) {
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const customer = await prisma.user.create({
      data: {
        email: `cust-extra-${suffix}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Cust',
        lastName: 'Extra',
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
        status: OrderStatus.PENDING_PAYMENT,
        expiresAt: new Date(Date.now() + 30 * 60_000),
        paymentStatus: PaymentStatus.PENDING,
        currency: 'NGN',
        subtotalAmount: TOTAL,
        totalAmount: TOTAL,
        shipLine1: address.addressLine1,
        shipCity: address.city,
        shipState: address.state,
        shipCountry: 'Nigeria',
      },
    });
    const makePayment = (ref: string) =>
      prisma.payment.create({
        data: {
          orderId: order.id,
          provider: PaymentProvider.PAYSTACK,
          providerRef: ref,
          status: PaymentStatus.INITIATED,
          currency: 'NGN',
          amount: TOTAL,
          idempotencyKey: ref,
        },
      });
    const refA = `psk_ttw189_a_${suffix}`;
    const refB = `psk_ttw189_b_${suffix}`;
    const paymentA = await makePayment(refA);
    const paymentB = await makePayment(refB);
    return { order, paymentA, paymentB, refA, refB };
  }

  const chargeEvent = (reference: string) => ({
    event: 'charge.success',
    data: {
      reference,
      amount: TOTAL * 100,
      currency: 'NGN',
      status: 'success',
    },
  });

  it('settles attempt B once and records attempt A as one extra capture under parallel delivery', async () => {
    const emit = jest.spyOn(adminNotify, 'emit');
    const { order, paymentA, paymentB, refA, refB } =
      await createOrderWithTwoAttempts(`par-${Date.now()}`);

    await webhooks.processChargeSuccess(chargeEvent(refB));
    await Promise.all(
      Array.from({ length: 20 }, () =>
        webhooks.processChargeSuccess(chargeEvent(refA)),
      ),
    );
    await webhooks.processChargeSuccess(chargeEvent(refA));

    const orderAfter = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(orderAfter.status).toBe(OrderStatus.PAID);

    const settling = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentB.id },
    });
    expect(settling.status).toBe(PaymentStatus.SUCCEEDED);

    // The extra capture keeps its status: refund lookups and reconciliation
    // must keep pointing at the settling payment (TTW-189, D4).
    const extra = await prisma.payment.findUniqueOrThrow({
      where: { id: paymentA.id },
    });
    expect(extra.status).toBe(PaymentStatus.INITIATED);
    expect(
      await prisma.chargeSettlementClaim.count({
        where: { paymentId: paymentA.id },
      }),
    ).toBe(1);
    expect(
      await prisma.payment.count({
        where: { orderId: order.id, status: PaymentStatus.SUCCEEDED },
      }),
    ).toBe(1);

    const extraEmits = emit.mock.calls.filter(
      ([, payload]) =>
        (payload as { reference?: string } | undefined)?.reference === refA,
    );
    expect(extraEmits).toHaveLength(1);
  });

  it('reports the extra capture as a reconciliation-visible claim on a non-SUCCEEDED payment', async () => {
    const { order, paymentA, refA, refB } = await createOrderWithTwoAttempts(
      `rec-${Date.now()}`,
    );
    await webhooks.processChargeSuccess(chargeEvent(refB));
    await webhooks.processChargeSuccess(chargeEvent(refA));

    const claims = await prisma.chargeSettlementClaim.findMany({
      where: {
        orderId: order.id,
        payment: { status: { not: PaymentStatus.SUCCEEDED } },
      },
    });
    expect(claims.map((c) => c.paymentId)).toEqual([paymentA.id]);
  });
});
