import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import * as crypto from 'node:crypto';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaystackWebhookService } from '../src/orders/paystack-webhook.service';
import { InventoryLifecycleService } from '../src/inventory/inventory-lifecycle.service';
import { AdminNotifyService } from '../src/admin-notifications/admin-notify.service';
import { ADMIN_NOTIF_PAYMENT_CAPTURED_CANCELLED_ORDER } from '../src/admin-notifications/admin-notification-events';
import {
  OrderItemSnapshotSource,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  ProductStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

/**
 * TTW-248: a signed charge.success without amount or currency never pays an
 * order. It leaves the order PENDING_PAYMENT with its stock still reserved and
 * no settlement claim, tells an admin, and a later complete delivery settles
 * exactly once (a redelivery is then a duplicate).
 */
describe('charge.success without amount or currency (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let webhooks: PaystackWebhookService;
  let adminNotify: AdminNotifyService;
  let inventoryLifecycle: InventoryLifecycleService;
  let secret: string;

  const QTY = 2;
  const TOTAL = 1000 * QTY;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    webhooks = app.get(PaystackWebhookService);
    adminNotify = app.get(AdminNotifyService);
    inventoryLifecycle = app.get(InventoryLifecycleService);
    secret = app.get(ConfigService).getOrThrow<string>('PAYSTACK_SECRET_KEY');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  /** Deliver an event the way Paystack does: raw body plus HMAC signature. */
  async function deliver(event: object, signWith = secret): Promise<boolean> {
    const raw = JSON.stringify(event);
    const signature = crypto
      .createHmac('sha512', signWith)
      .update(raw)
      .digest('hex');
    return webhooks.handleWebhook(raw, signature);
  }

  async function createReservedPendingOrder(suffix: string) {
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const customer = await prisma.user.create({
      data: {
        email: `malformed-${suffix}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Mal',
        lastName: 'Formed',
      },
    });
    const category = await prisma.category.create({
      data: { name: `Mal Cat ${suffix}`, slug: `mal-cat-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Mal Product ${suffix}`,
        slug: `mal-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default',
        sku: `SKU-MAL-${suffix}`,
      },
    });
    await prisma.inventoryItem.create({
      data: {
        variantId: variant.id,
        stockOnHand: 10,
        reserved: 0,
        trackInventory: true,
        lowStockThreshold: 2,
      },
    });
    const address = await prisma.address.create({
      data: {
        userId: customer.id,
        addressLine1: '1 Mal Street',
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
        paymentStatus: PaymentStatus.PENDING,
        currency: 'NGN',
        subtotalAmount: TOTAL,
        totalAmount: TOTAL,
        shipLine1: address.addressLine1,
        shipCity: address.city,
        shipState: 'Lagos',
        shipCountry: 'Nigeria',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        items: {
          create: {
            productId: product.id,
            variantId: variant.id,
            quantity: QTY,
            unitBasePrice: 1000,
            unitFinalPrice: 1000,
            productNameSnapshot: product.name,
            variantDisplaySnapshot: variant.name,
            optionPresentationSnapshot: [],
            snapshotSource: OrderItemSnapshotSource.PURCHASE,
            snapshotVersion: 1,
          },
        },
      },
      include: { items: true },
    });
    await prisma.$transaction(async (tx) => {
      await inventoryLifecycle.reserveOrderItems(
        order.id,
        order.items.map((i) => ({
          id: i.id,
          variantId: i.variantId,
          quantity: i.quantity,
        })),
        tx,
      );
    });
    const providerRef = `psk_ttw248_${suffix}`;
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
    return { order, payment, variant, providerRef };
  }

  async function state(orderId: string, paymentId: string, variantId: string) {
    const [order, payment, inventory, claims] = await Promise.all([
      prisma.order.findUniqueOrThrow({ where: { id: orderId } }),
      prisma.payment.findUniqueOrThrow({ where: { id: paymentId } }),
      prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } }),
      prisma.chargeSettlementClaim.count({ where: { paymentId } }),
    ]);
    return { order, payment, inventory, claims };
  }

  it('refuses a missing amount, then a missing currency, then settles once with both; a redelivery is a duplicate', async () => {
    const emit = jest.spyOn(adminNotify, 'emit');
    const { order, payment, variant, providerRef } =
      await createReservedPendingOrder(`flow-${Date.now()}`);
    const event = (data: Record<string, unknown>) => ({
      event: 'charge.success',
      data: { reference: providerRef, status: 'success', ...data },
    });

    // 1. No amount.
    await deliver(event({ currency: 'NGN' }));
    let s = await state(order.id, payment.id, variant.id);
    expect(s.order.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(s.order.paymentStatus).toBe(PaymentStatus.PENDING);
    expect(s.payment.status).toBe(PaymentStatus.INITIATED);
    expect(s.inventory.reserved).toBe(QTY);
    expect(s.inventory.stockOnHand).toBe(10);
    expect(s.claims).toBe(0);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(emit).toHaveBeenLastCalledWith(
      ADMIN_NOTIF_PAYMENT_CAPTURED_CANCELLED_ORDER,
      expect.objectContaining({
        orderId: order.id,
        reference: providerRef,
        reason: expect.stringMatching(/amount or currency/i),
      }),
    );

    // 2. No currency.
    await deliver(event({ amount: TOTAL * 100 }));
    s = await state(order.id, payment.id, variant.id);
    expect(s.order.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(s.inventory.reserved).toBe(QTY);
    expect(s.claims).toBe(0);
    expect(emit).toHaveBeenCalledTimes(2);

    // 3. Both present: settles exactly once.
    emit.mockClear();
    await deliver(event({ amount: TOTAL * 100, currency: 'NGN' }));
    s = await state(order.id, payment.id, variant.id);
    expect(s.order.status).toBe(OrderStatus.PAID);
    expect(s.payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(s.inventory.reserved).toBe(0);
    expect(s.inventory.stockOnHand).toBe(10 - QTY);
    expect(s.claims).toBe(1);

    // 4. Redelivery of the complete event is a duplicate.
    await deliver(event({ amount: TOTAL * 100, currency: 'NGN' }));
    s = await state(order.id, payment.id, variant.id);
    expect(s.order.status).toBe(OrderStatus.PAID);
    expect(s.inventory.stockOnHand).toBe(10 - QTY);
    expect(s.claims).toBe(1);
    const paidAudits = await prisma.auditLog.count({
      where: {
        entityId: order.id,
        eventName: 'webhook.payment.charge_success',
      },
    });
    expect(paidAudits).toBe(1);
  });

  it('refuses an event with neither field under parallel delivery, and the order can still be settled afterwards', async () => {
    const { order, payment, variant, providerRef } =
      await createReservedPendingOrder(`par-${Date.now()}`);
    const bare = {
      event: 'charge.success',
      data: { reference: providerRef, status: 'success' },
    };

    await Promise.all(Array.from({ length: 10 }, () => deliver(bare)));
    let s = await state(order.id, payment.id, variant.id);
    expect(s.order.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(s.inventory.reserved).toBe(QTY);
    expect(s.claims).toBe(0);

    await Promise.all(
      Array.from({ length: 10 }, () =>
        deliver({
          event: 'charge.success',
          data: {
            reference: providerRef,
            status: 'success',
            amount: TOTAL * 100,
            currency: 'NGN',
          },
        }),
      ),
    );
    s = await state(order.id, payment.id, variant.id);
    expect(s.order.status).toBe(OrderStatus.PAID);
    expect(s.claims).toBe(1);
    expect(s.inventory.stockOnHand).toBe(10 - QTY);
  });

  it('rejects a signature made with another key, a truncated one and an empty one', async () => {
    const { order, payment, variant, providerRef } =
      await createReservedPendingOrder(`sig-${Date.now()}`);
    const raw = JSON.stringify({
      event: 'charge.success',
      data: {
        reference: providerRef,
        amount: TOTAL * 100,
        currency: 'NGN',
      },
    });
    const good = crypto.createHmac('sha512', secret).update(raw).digest('hex');
    const forged = crypto
      .createHmac('sha512', 'not-the-key')
      .update(raw)
      .digest('hex');

    for (const bad of [forged, good.slice(0, -1), '']) {
      await expect(webhooks.handleWebhook(raw, bad)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
    }
    const s = await state(order.id, payment.id, variant.id);
    expect(s.order.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect(s.claims).toBe(0);

    await expect(webhooks.handleWebhook(raw, good)).resolves.toBe(true);
    expect((await state(order.id, payment.id, variant.id)).order.status).toBe(
      OrderStatus.PAID,
    );
  });
});
