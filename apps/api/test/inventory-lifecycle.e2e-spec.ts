import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaystackWebhookService } from '../src/orders/paystack-webhook.service';
import { InventoryLifecycleService } from '../src/inventory/inventory-lifecycle.service';
import { OrdersService } from '../src/orders/orders.service';
import {
  InventoryMovementKind,
  OrderStatus,
  PaymentProvider,
  PaymentStatus,
  ProductStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

/**
 * TTW-014: reserve → consume on charge.success; reserve → release on unpaid cancel;
 * duplicate transitions are no-ops; counters never go negative.
 */
describe('Inventory lifecycle (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let webhooks: PaystackWebhookService;
  let inventoryLifecycle: InventoryLifecycleService;
  let orders: OrdersService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    webhooks = app.get(PaystackWebhookService);
    inventoryLifecycle = app.get(InventoryLifecycleService);
    orders = app.get(OrdersService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function seedTrackedVariant(suffix: string, stockOnHand = 10) {
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const customer = await prisma.user.create({
      data: {
        email: `inv-cust-${suffix}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Inv',
        lastName: 'Cust',
      },
    });
    const category = await prisma.category.create({
      data: {
        name: `Inv Cat ${suffix}`,
        slug: `inv-cat-${suffix}`,
      },
    });
    const product = await prisma.product.create({
      data: {
        name: `Inv Product ${suffix}`,
        slug: `inv-product-${suffix}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
      },
    });
    const variant = await prisma.productVariant.create({
      data: {
        productId: product.id,
        name: 'Default',
        sku: `SKU-INV-${suffix}`,
      },
    });
    const inventory = await prisma.inventoryItem.create({
      data: {
        variantId: variant.id,
        stockOnHand,
        reserved: 0,
        trackInventory: true,
        lowStockThreshold: 2,
      },
    });
    const address = await prisma.address.create({
      data: {
        userId: customer.id,
        addressLine1: '1 Inv Street',
        city: 'Lagos',
        state: 'Lagos',
        country: 'Nigeria',
      },
    });
    return { customer, product, variant, inventory, address };
  }

  async function createReservedPendingOrder(
    suffix: string,
    qty: number,
    stockOnHand = 10,
  ) {
    const seeded = await seedTrackedVariant(suffix, stockOnHand);
    const order = await prisma.order.create({
      data: {
        userId: seeded.customer.id,
        shippingAddressId: seeded.address.id,
        status: OrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.PENDING,
        currency: 'NGN',
        subtotalAmount: 1000 * qty,
        totalAmount: 1000 * qty,
        shipLine1: seeded.address.addressLine1,
        shipCity: seeded.address.city,
        shipState: seeded.address.state!,
        shipCountry: 'Nigeria',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        items: {
          create: {
            productId: seeded.product.id,
            variantId: seeded.variant.id,
            quantity: qty,
            unitBasePrice: 1000,
            unitFinalPrice: 1000,
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

    const inv = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: seeded.variant.id },
    });
    expect(inv.reserved).toBe(qty);
    expect(inv.stockOnHand).toBe(stockOnHand);

    return { ...seeded, order, qty };
  }

  it('consumes reserved stock exactly once on duplicate charge.success', async () => {
    const suffix = `consume-${Date.now()}`;
    const { order, variant, qty } = await createReservedPendingOrder(suffix, 3);
    const providerRef = `psk_inv_${suffix}`;
    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: PaymentProvider.PAYSTACK,
        providerRef,
        status: PaymentStatus.INITIATED,
        currency: 'NGN',
        amount: Number(order.totalAmount),
        idempotencyKey: providerRef,
      },
    });

    const event = {
      event: 'charge.success',
      data: {
        reference: providerRef,
        status: 'success',
        amount: Number(order.totalAmount) * 100,
        currency: 'NGN',
      },
    };

    await Promise.all([
      webhooks.processChargeSuccess(event),
      webhooks.processChargeSuccess(event),
      webhooks.processChargeSuccess(event),
    ]);

    const paid = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(paid.status).toBe(OrderStatus.PAID);

    const inv = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: variant.id },
    });
    expect(inv.reserved).toBe(0);
    expect(inv.stockOnHand).toBe(10 - qty);

    const consumes = await prisma.inventoryMovement.findMany({
      where: {
        orderId: order.id,
        kind: InventoryMovementKind.CONSUME,
      },
    });
    expect(consumes).toHaveLength(1);
    expect(consumes[0].effectKey).toBe(
      `inventory.consume:orderItem:${order.items[0].id}`,
    );

    const reserves = await prisma.inventoryMovement.count({
      where: { orderId: order.id, kind: InventoryMovementKind.RESERVE },
    });
    expect(reserves).toBe(1);
  });

  it('releases reserved stock on unpaid admin cancel and is idempotent', async () => {
    const suffix = `release-${Date.now()}`;
    const { order, variant, qty } = await createReservedPendingOrder(suffix, 2);

    await orders.updateOrderStatus(order.id, OrderStatus.CANCELLED);

    const cancelled = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(cancelled.status).toBe(OrderStatus.CANCELLED);

    const inv = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: variant.id },
    });
    expect(inv.reserved).toBe(0);
    expect(inv.stockOnHand).toBe(10);

    const releases = await prisma.inventoryMovement.findMany({
      where: { orderId: order.id, kind: InventoryMovementKind.RELEASE },
    });
    expect(releases).toHaveLength(1);

    // Explicit duplicate release is a no-op.
    await prisma.$transaction(async (tx) => {
      await inventoryLifecycle.releaseOrderItems(
        order.id,
        order.items.map((i) => ({
          id: i.id,
          variantId: i.variantId,
          quantity: i.quantity,
        })),
        tx,
      );
    });
    const inv2 = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: variant.id },
    });
    expect(inv2.reserved).toBe(0);
    expect(inv2.stockOnHand).toBe(10);
    expect(qty).toBe(2);
  });

  it('reconciles movement deltas against inventory counters', async () => {
    const suffix = `recon-${Date.now()}`;
    const { order, variant, qty } = await createReservedPendingOrder(suffix, 4);
    const providerRef = `psk_recon_${suffix}`;
    await prisma.payment.create({
      data: {
        orderId: order.id,
        provider: PaymentProvider.PAYSTACK,
        providerRef,
        status: PaymentStatus.INITIATED,
        currency: 'NGN',
        amount: Number(order.totalAmount),
        idempotencyKey: providerRef,
      },
    });
    await webhooks.processChargeSuccess({
      event: 'charge.success',
      data: {
        reference: providerRef,
        status: 'success',
        amount: Number(order.totalAmount) * 100,
        currency: 'NGN',
      },
    });

    const movements = await prisma.inventoryMovement.findMany({
      where: { variantId: variant.id },
    });
    const reservedDelta = movements.reduce((s, m) => s + m.reservedDelta, 0);
    const stockDelta = movements.reduce((s, m) => s + m.stockOnHandDelta, 0);
    const inv = await prisma.inventoryItem.findUniqueOrThrow({
      where: { variantId: variant.id },
    });

    // Start stock 10 / reserved 0 → after reserve+consume: reserved 0, stock 10-qty
    expect(inv.reserved).toBe(0);
    expect(inv.stockOnHand).toBe(10 - qty);
    expect(reservedDelta).toBe(0); // +qty then -qty
    expect(stockDelta).toBe(-qty);
  });
});
