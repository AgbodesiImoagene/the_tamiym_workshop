import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaystackWebhookService } from '../src/orders/paystack-webhook.service';
import {
  CampaignStatus,
  LedgerEntryType,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

/**
 * TTW-010: charge.success settles exactly once under concurrent duplicate delivery.
 */
describe('Paystack charge settlement idempotency (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let webhooks: PaystackWebhookService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    webhooks = app.get(PaystackWebhookService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function createPendingCampaignOrder(suffix: string) {
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const organizer = await prisma.user.create({
      data: {
        email: `org-settle-${suffix}@example.com`,
        passwordHash,
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        firstName: 'Org',
        lastName: 'Settle',
      },
    });
    const customer = await prisma.user.create({
      data: {
        email: `cust-settle-${suffix}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Cust',
        lastName: 'Settle',
      },
    });
    const campaign = await prisma.campaign.create({
      data: {
        organizerId: organizer.id,
        title: `Settle ${suffix}`,
        slug: `settle-${suffix}`,
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
    const totalAmount = 1500;
    const order = await prisma.order.create({
      data: {
        userId: customer.id,
        shippingAddressId: address.id,
        status: OrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.PENDING,
        currency: 'NGN',
        subtotalAmount: totalAmount,
        totalAmount,
        shipLine1: address.addressLine1,
        shipCity: address.city,
        shipState: address.state,
        shipCountry: 'Nigeria',
        campaignId: campaign.id,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    const providerRef = `psk_ttw010_${suffix}`;
    const payment = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: PaymentProvider.PAYSTACK,
        providerRef,
        status: PaymentStatus.INITIATED,
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

  it('settles once for serial duplicate charge.success deliveries', async () => {
    const suffix = `serial-${Date.now()}`;
    const { order, campaign, providerRef, totalAmount } =
      await createPendingCampaignOrder(suffix);

    const event = {
      event: 'charge.success',
      data: {
        reference: providerRef,
        status: 'success',
        amount: totalAmount * 100,
        currency: 'NGN',
      },
    };

    await webhooks.processChargeSuccess(event);
    await webhooks.processChargeSuccess(event);
    await webhooks.processChargeSuccess(event);

    const paid = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(paid.status).toBe(OrderStatus.PAID);
    expect(paid.paymentStatus).toBe(PaymentStatus.SUCCEEDED);

    const claims = await prisma.chargeSettlementClaim.count({
      where: { orderId: order.id },
    });
    expect(claims).toBe(1);

    const ledger = await prisma.campaignBalanceLedgerEntry.findMany({
      where: {
        orderId: order.id,
        entryType: LedgerEntryType.PAYMENT_SETTLED,
      },
    });
    expect(ledger).toHaveLength(1);

    const updatedCampaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: campaign.id },
    });
    expect(Number(updatedCampaign.currentAmount)).toBe(totalAmount);

    const outbox = await prisma.notificationOutbox.findMany({
      where: { dedupeKey: `PaymentConfirmed:${order.id}` },
    });
    expect(outbox).toHaveLength(1);

    const audits = await prisma.auditLog.count({
      where: {
        entityId: order.id,
        eventName: 'webhook.payment.charge_success',
      },
    });
    expect(audits).toBe(1);
  });

  it('settles once under fifty concurrent identical charge.success events', async () => {
    const suffix = `conc-${Date.now()}`;
    const { order, campaign, providerRef, totalAmount } =
      await createPendingCampaignOrder(suffix);

    const event = {
      event: 'charge.success',
      data: {
        reference: providerRef,
        status: 'success',
        amount: totalAmount * 100,
        currency: 'NGN',
      },
    };

    await Promise.all(
      Array.from({ length: 50 }, () => webhooks.processChargeSuccess(event)),
    );

    const paid = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(paid.status).toBe(OrderStatus.PAID);

    expect(
      await prisma.chargeSettlementClaim.count({
        where: { orderId: order.id },
      }),
    ).toBe(1);
    expect(
      await prisma.campaignBalanceLedgerEntry.count({
        where: {
          orderId: order.id,
          entryType: LedgerEntryType.PAYMENT_SETTLED,
        },
      }),
    ).toBe(1);

    const updatedCampaign = await prisma.campaign.findUniqueOrThrow({
      where: { id: campaign.id },
    });
    expect(Number(updatedCampaign.currentAmount)).toBe(totalAmount);

    expect(
      await prisma.notificationOutbox.count({
        where: { dedupeKey: `PaymentConfirmed:${order.id}` },
      }),
    ).toBe(1);

    expect(
      await prisma.auditLog.count({
        where: {
          entityId: order.id,
          eventName: 'webhook.payment.charge_success',
        },
      }),
    ).toBe(1);
  });
});
