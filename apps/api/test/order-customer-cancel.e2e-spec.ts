import { INestApplication, NotFoundException } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { OrdersService } from '../src/orders/orders.service';
import { PaystackWebhookService } from '../src/orders/paystack-webhook.service';
import {
  CurrencyCode,
  InventoryMovementKind,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  ProductStatus,
  ShippingRateProvider,
  ShippingRuleMatchType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';
import { ensureLga } from './utils/geo-fixtures';

const PASSWORD = 'TestPassword1!';
const QTY = 2;

/**
 * TTW-107: a customer cancels their own unpaid order. The reservation is
 * released exactly once, the open payment attempt is closed, and a charge that
 * races with or follows the cancel never loses money. Real Postgres, real
 * services.
 */
describe('Customer cancels an unpaid order (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let orders: OrdersService;
  let webhooks: PaystackWebhookService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    orders = app.get(OrdersService);
    webhooks = app.get(PaystackWebhookService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  /** A customer, a tracked variant (stock 20) and a deliverable address. */
  async function seed(suffix: string) {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const customer = await prisma.user.create({
      data: {
        email: `cancel-cust-${suffix}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Cancel',
        lastName: 'Cust',
      },
    });
    const category = await prisma.category.create({
      data: { name: `Cancel Cat ${suffix}`, slug: `cancel-cat-${suffix}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Cancel Product ${suffix}`,
        slug: `cancel-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
        prices: { create: { currency: CurrencyCode.NGN, amount: 5000 } },
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default',
        sku: `SKU-CANCEL-${suffix}`,
      },
    });
    await prisma.inventoryItem.create({
      data: {
        variantId: variant.id,
        stockOnHand: 20,
        reserved: 0,
        trackInventory: true,
        lowStockThreshold: 0,
      },
    });
    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    const zone = await prisma.shippingZone.create({
      data: { name: `Cancel Lagos ${suffix}`, isActive: true },
    });
    await prisma.shippingZoneRule.create({
      data: {
        zoneId: zone.id,
        countryCode: 'NG',
        matchType: ShippingRuleMatchType.ADMIN1,
        matchValue: 'LA',
        priority: 100,
        isActive: true,
      },
    });
    await prisma.shippingRate.create({
      data: {
        zoneId: zone.id,
        provider: ShippingRateProvider.INTERNAL,
        serviceLevel: 'STANDARD',
        currency: CurrencyCode.NGN,
        flatFee: 2000,
        priority: 100,
        isActive: true,
        minDeliveryDays: 2,
        maxDeliveryDays: 4,
      },
    });
    const address = await prisma.address.create({
      data: {
        userId: customer.id,
        addressLine1: '1 Cancel Street',
        city: 'Ikeja',
        state: 'Lagos',
        stateCode: 'LA',
        lgaId: (await ensureLga(prisma)).id,
        countryCode: 'NG',
        country: 'Nigeria',
      },
    });
    return { customer, variant, address };
  }

  /** An unpaid order with its stock reserved, and optionally a payment attempt. */
  async function unpaidOrder(
    suffix: string,
    opts: { payment?: PaymentStatus } = {},
  ) {
    const { customer, variant, address } = await seed(suffix);
    const created = await orders.create(customer.id, {
      shippingAddressId: address.id,
      items: [{ variantId: variant.id, quantity: QTY }],
    });
    const order = await prisma.order.findUniqueOrThrow({
      where: { id: created.id },
    });
    let payment = null;
    const providerRef = `psk_ttw107_${suffix}`;
    if (opts.payment) {
      payment = await prisma.payment.create({
        data: {
          orderId: order.id,
          provider: PaymentProvider.PAYSTACK,
          providerRef,
          status: opts.payment,
          currency: 'NGN',
          amount: order.totalAmount,
          idempotencyKey: providerRef,
        },
      });
    }
    return { customer, variant, order, payment, providerRef };
  }

  const inventory = (variantId: string) =>
    prisma.inventoryItem.findUniqueOrThrow({ where: { variantId } });

  const releaseMovements = (orderId: string) =>
    prisma.inventoryMovement.count({
      where: { orderId, kind: InventoryMovementKind.RELEASE },
    });

  function chargeEvent(providerRef: string, totalAmount: unknown) {
    return {
      event: 'charge.success',
      data: {
        reference: providerRef,
        amount: Math.round(Number(totalAmount) * 100),
        currency: 'NGN',
        status: 'success',
      },
    };
  }

  it('cancels the order, returns the stock and closes the payment attempt', async () => {
    const { customer, variant, order, payment } = await unpaidOrder(
      `ok-${Date.now()}`,
      { payment: PaymentStatus.INITIATED },
    );
    expect((await inventory(variant.id)).reserved).toBe(QTY);

    const result = await orders.cancelMyOrder(customer.id, order.id);

    expect(result.status).toBe(OrderStatus.CANCELLED);
    expect(result.cancelledAt).not.toBeNull();
    expect((await inventory(variant.id)).reserved).toBe(0);
    expect(await releaseMovements(order.id)).toBe(1);
    const closed = await prisma.payment.findUniqueOrThrow({
      where: { id: payment!.id },
    });
    expect(closed.status).toBe(PaymentStatus.FAILED);
  });

  it('refuses a second cancel with the terminal code and releases nothing twice', async () => {
    const { customer, variant, order } = await unpaidOrder(`dup-${Date.now()}`);

    await orders.cancelMyOrder(customer.id, order.id);
    await expect(
      orders.cancelMyOrder(customer.id, order.id),
    ).rejects.toMatchObject({
      response: { code: 'CANCEL_NOT_ALLOWED_TERMINAL' },
    });

    expect((await inventory(variant.id)).reserved).toBe(0);
    expect(await releaseMovements(order.id)).toBe(1);
  });

  it('releases the reservation exactly once under concurrent cancels', async () => {
    const { customer, variant, order } = await unpaidOrder(`par-${Date.now()}`);

    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        orders.cancelMyOrder(customer.id, order.id),
      ),
    );

    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await inventory(variant.id)).reserved).toBe(0);
    expect(await releaseMovements(order.id)).toBe(1);
    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(row.status).toBe(OrderStatus.CANCELLED);
  });

  it('refuses a paid order and leaves it untouched', async () => {
    const { customer, variant, order } = await unpaidOrder(
      `paid-${Date.now()}`,
    );
    await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.PAID },
    });

    await expect(
      orders.cancelMyOrder(customer.id, order.id),
    ).rejects.toMatchObject({
      response: { code: 'CANCEL_NOT_ALLOWED_USE_REFUND' },
    });

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(row.status).toBe(OrderStatus.PAID);
    expect((await inventory(variant.id)).reserved).toBe(QTY);
    expect(await releaseMovements(order.id)).toBe(0);
  });

  it("answers 404 for another customer's order and changes nothing", async () => {
    const { variant, order } = await unpaidOrder(`other-${Date.now()}`);

    await expect(
      orders.cancelMyOrder('someone-else', order.id),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      orders.cancelMyOrder('someone-else', 'missing-order'),
    ).rejects.toBeInstanceOf(NotFoundException);

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(row.status).toBe(OrderStatus.PENDING_PAYMENT);
    expect((await inventory(variant.id)).reserved).toBe(QTY);
  });

  it('records a charge that arrives after the cancel as a late capture', async () => {
    const { customer, variant, order, providerRef } = await unpaidOrder(
      `late-${Date.now()}`,
      { payment: PaymentStatus.INITIATED },
    );
    await orders.cancelMyOrder(customer.id, order.id);

    await webhooks.processChargeSuccess(
      chargeEvent(providerRef, order.totalAmount),
    );
    // Redelivery is a duplicate.
    await webhooks.processChargeSuccess(
      chargeEvent(providerRef, order.totalAmount),
    );

    const row = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(row.status).toBe(OrderStatus.CANCELLED);
    const payment = await prisma.payment.findFirstOrThrow({
      where: { providerRef },
    });
    expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
    expect(
      await prisma.chargeSettlementClaim.count({
        where: { orderId: order.id },
      }),
    ).toBe(1);
    // Stock was released once by the cancel and never consumed.
    expect((await inventory(variant.id)).reserved).toBe(0);
    expect(await releaseMovements(order.id)).toBe(1);
    expect(
      await prisma.inventoryMovement.count({
        where: { orderId: order.id, kind: InventoryMovementKind.CONSUME },
      }),
    ).toBe(0);
  });

  it('rolls the settlement back when the cancel commits after the webhook read the order, and records the redelivery', async () => {
    const { customer, variant, order, providerRef } = await unpaidOrder(
      `det-${Date.now()}`,
      { payment: PaymentStatus.INITIATED },
    );
    // The webhook has read the order as PENDING_PAYMENT; the cancel commits
    // before the webhook's settlement transaction starts.
    const realFindFirst = prisma.payment.findFirst.bind(prisma.payment);
    const findFirst = jest
      .spyOn(prisma.payment, 'findFirst')
      .mockImplementationOnce(((args: never) =>
        (async () => {
          const stale = await realFindFirst(args);
          await orders.cancelMyOrder(customer.id, order.id);
          return stale;
        })()) as never);

    await expect(
      webhooks.processChargeSuccess(
        chargeEvent(providerRef, order.totalAmount),
      ),
    ).rejects.toThrow(/was not PENDING_PAYMENT/);
    findFirst.mockRestore();

    // Rolled back: no claim, no consumed stock, the order stays cancelled.
    expect(
      await prisma.chargeSettlementClaim.count({
        where: { orderId: order.id },
      }),
    ).toBe(0);
    expect(
      await prisma.inventoryMovement.count({
        where: { orderId: order.id, kind: InventoryMovementKind.CONSUME },
      }),
    ).toBe(0);
    expect(
      (await prisma.order.findUniqueOrThrow({ where: { id: order.id } }))
        .status,
    ).toBe(OrderStatus.CANCELLED);

    // Paystack delivers the event again: recorded as a late capture.
    await webhooks.processChargeSuccess(
      chargeEvent(providerRef, order.totalAmount),
    );
    expect(
      await prisma.chargeSettlementClaim.count({
        where: { orderId: order.id },
      }),
    ).toBe(1);
    expect(
      (await prisma.payment.findFirstOrThrow({ where: { providerRef } }))
        .status,
    ).toBe(PaymentStatus.SUCCEEDED);
    expect((await inventory(variant.id)).reserved).toBe(0);
    expect(await releaseMovements(order.id)).toBe(1);
  });

  it('closes a PENDING attempt and leaves older FAILED and SUCCEEDED attempts alone', async () => {
    const { customer, order, payment } = await unpaidOrder(
      `mix-${Date.now()}`,
      { payment: PaymentStatus.PENDING },
    );
    const failed = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: PaymentProvider.PAYSTACK,
        providerRef: `psk_ttw107_old_${Date.now()}`,
        status: PaymentStatus.FAILED,
        currency: 'NGN',
        amount: order.totalAmount,
        idempotencyKey: `old_${Date.now()}`,
      },
    });
    const succeeded = await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: PaymentProvider.PAYSTACK,
        providerRef: `psk_ttw107_set_${Date.now()}`,
        status: PaymentStatus.SUCCEEDED,
        currency: 'NGN',
        amount: order.totalAmount,
        idempotencyKey: `set_${Date.now()}`,
      },
    });

    await orders.cancelMyOrder(customer.id, order.id);

    const status = async (id: string) =>
      (await prisma.payment.findUniqueOrThrow({ where: { id } })).status;
    expect(await status(payment!.id)).toBe(PaymentStatus.FAILED);
    expect(await status(failed.id)).toBe(PaymentStatus.FAILED);
    expect(await status(succeeded.id)).toBe(PaymentStatus.SUCCEEDED);
  });

  it('never loses money when a charge races with the cancel', async () => {
    for (let i = 0; i < 4; i++) {
      const { customer, variant, order, providerRef } = await unpaidOrder(
        `race${i}-${Date.now()}`,
        { payment: PaymentStatus.INITIATED },
      );

      const [cancel, delivery] = await Promise.allSettled([
        orders.cancelMyOrder(customer.id, order.id),
        webhooks.processChargeSuccess(
          chargeEvent(providerRef, order.totalAmount),
        ),
      ]);
      if (delivery.status === 'rejected') {
        // The cancel committed between the webhook's read and its settlement:
        // the settlement transaction rolled back and the endpoint answers an
        // error, so Paystack delivers the event again. Replay that redelivery.
        expect(cancel.status).toBe('fulfilled');
      }
      await webhooks.processChargeSuccess(
        chargeEvent(providerRef, order.totalAmount),
      );

      const row = await prisma.order.findUniqueOrThrow({
        where: { id: order.id },
      });
      const payment = await prisma.payment.findFirstOrThrow({
        where: { providerRef },
      });
      const claims = await prisma.chargeSettlementClaim.count({
        where: { orderId: order.id },
      });
      // Exactly one outcome, and the captured money is always on record.
      expect(claims).toBe(1);
      expect(payment.status).toBe(PaymentStatus.SUCCEEDED);
      const released = await releaseMovements(order.id);
      const consumed = await prisma.inventoryMovement.count({
        where: { orderId: order.id, kind: InventoryMovementKind.CONSUME },
      });
      if (row.status === OrderStatus.CANCELLED) {
        expect(cancel.status).toBe('fulfilled');
        expect(released).toBe(1);
        expect(consumed).toBe(0);
        expect((await inventory(variant.id)).reserved).toBe(0);
      } else {
        // The payment won: the cancel was refused and the stock is consumed.
        expect(cancel.status).toBe('rejected');
        expect(row.status).not.toBe(OrderStatus.CANCELLED);
        expect(released).toBe(0);
        expect(consumed).toBe(1);
      }
    }
  });
});
