import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { ShipmentsService } from '../src/shipments/shipments.service';
import {
  OrderStatus,
  PaymentStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

/**
 * TTW-106: a shipment moves the order to FULFILLED then DELIVERED, and each of
 * the two customer emails is written exactly once, in the same transaction as
 * the order change, even when admins double-click or two admins act together.
 * Real Postgres, real services.
 */
describe('Shipment emails (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let shipments: ShipmentsService;
  let counter = 0;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    shipments = app.get(ShipmentsService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function seedProcessingOrder(
    status: OrderStatus = OrderStatus.PROCESSING,
  ) {
    const suffix = `${Date.now()}-${counter++}`;
    const user = await prisma.user.create({
      data: {
        email: `ship-cust-${suffix}@example.com`,
        passwordHash: await bcrypt.hash('TestPassword1!', 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Ship',
        lastName: 'Cust',
      },
    });
    const address = await prisma.address.create({
      data: {
        userId: user.id,
        addressLine1: '1 Ship Street',
        city: 'Ikeja',
        state: 'Lagos',
      },
    });
    const order = await prisma.order.create({
      data: {
        userId: user.id,
        shippingAddressId: address.id,
        status,
        paymentStatus: PaymentStatus.SUCCEEDED,
        subtotalAmount: 5000,
        totalAmount: 5000,
        shipLine1: '1 Ship Street',
        shipCity: 'Ikeja',
        shipState: 'Lagos',
      },
    });
    return { user, order };
  }

  async function emailRows(orderId: string) {
    return prisma.notificationOutbox.findMany({
      where: { dedupeKey: { endsWith: `:${orderId}` } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async function dispatch(
    shipmentId: string,
    orderId: string,
    userId: string,
    key: string,
    trackingNumber = `TRK-${orderId}`,
  ) {
    return shipments.updateStatus(
      shipmentId,
      { status: 'DISPATCHED', idempotencyKey: key, trackingNumber },
      userId,
    );
  }

  it('writes no email on create, OrderFulfilled on dispatch and OrderDelivered on delivery', async () => {
    const { user, order } = await seedProcessingOrder();

    const shipment = await shipments.createForOrder(
      order.id,
      { carrierCode: 'MANUAL', idempotencyKey: `create-${order.id}` },
      user.id,
    );
    expect(await emailRows(order.id)).toHaveLength(0);

    await dispatch(shipment.id, order.id, user.id, `dispatch-${order.id}`);
    expect((await emailRows(order.id)).map((r) => r.dedupeKey)).toEqual([
      `OrderFulfilled:${order.id}`,
    ]);

    await shipments.updateStatus(
      shipment.id,
      { status: 'IN_TRANSIT', idempotencyKey: `transit-${order.id}` },
      user.id,
    );
    await shipments.updateStatus(
      shipment.id,
      { status: 'DELIVERED', idempotencyKey: `deliver-${order.id}` },
      user.id,
    );

    const finalOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(finalOrder.status).toBe(OrderStatus.DELIVERED);
    const rows = await emailRows(order.id);
    expect(rows.map((r) => r.dedupeKey)).toEqual([
      `OrderFulfilled:${order.id}`,
      `OrderDelivered:${order.id}`,
    ]);
    expect(rows.every((r) => r.recipient === user.email)).toBe(true);
  });

  it('replaying the same create request writes no email at all', async () => {
    const { user, order } = await seedProcessingOrder();
    const dto = {
      carrierCode: 'MANUAL' as const,
      idempotencyKey: `replay-${order.id}`,
    };

    const results = await Promise.allSettled([
      shipments.createForOrder(order.id, dto, user.id),
      shipments.createForOrder(order.id, dto, user.id),
    ]);

    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(await emailRows(order.id)).toHaveLength(0);
  });

  it('a cancelled then recreated shipment still writes one OrderFulfilled row, at its dispatch', async () => {
    const { user, order } = await seedProcessingOrder();
    const first = await shipments.createForOrder(
      order.id,
      { carrierCode: 'MANUAL', idempotencyKey: `first-${order.id}` },
      user.id,
    );
    await shipments.updateStatus(
      first.id,
      { status: 'CANCELLED', idempotencyKey: `cancel-${order.id}` },
      user.id,
    );
    const second = await shipments.createForOrder(
      order.id,
      { carrierCode: 'MANUAL', idempotencyKey: `second-${order.id}` },
      user.id,
    );
    expect(await emailRows(order.id)).toHaveLength(0);

    await dispatch(second.id, order.id, user.id, `d2-${order.id}`);

    expect((await emailRows(order.id)).map((r) => r.dedupeKey)).toEqual([
      `OrderFulfilled:${order.id}`,
    ]);
  });

  it('an email row that already exists does not block the dispatch and is not doubled', async () => {
    const { user, order } = await seedProcessingOrder();
    await prisma.notificationOutbox.create({
      data: {
        eventName: 'OrderFulfilled',
        channel: 'EMAIL',
        recipient: user.email,
        recipientUserId: user.id,
        dedupeKey: `OrderFulfilled:${order.id}`,
        payload: { orderId: order.id },
      },
    });
    const shipment = await shipments.createForOrder(
      order.id,
      { carrierCode: 'MANUAL', idempotencyKey: `clash-${order.id}` },
      user.id,
    );

    await dispatch(shipment.id, order.id, user.id, `dc-${order.id}`);

    const after = await prisma.shipment.findUniqueOrThrow({
      where: { id: shipment.id },
    });
    expect(after.status).toBe('DISPATCHED');
    expect(await emailRows(order.id)).toHaveLength(1);
  });

  it('cancelled after dispatch, recreated and dispatched again: one row, and the second dispatch works', async () => {
    const { user, order } = await seedProcessingOrder();
    const first = await shipments.createForOrder(
      order.id,
      { carrierCode: 'MANUAL', idempotencyKey: `f1-${order.id}` },
      user.id,
    );
    await dispatch(first.id, order.id, user.id, `fd1-${order.id}`);
    await shipments.updateStatus(
      first.id,
      { status: 'CANCELLED', idempotencyKey: `fc-${order.id}` },
      user.id,
    );
    const second = await shipments.createForOrder(
      order.id,
      { carrierCode: 'MANUAL', idempotencyKey: `f2-${order.id}` },
      user.id,
    );

    await dispatch(
      second.id,
      order.id,
      user.id,
      `fd2-${order.id}`,
      `TRK2-${order.id}`,
    );

    const after = await prisma.shipment.findUniqueOrThrow({
      where: { id: second.id },
    });
    expect(after.status).toBe('DISPATCHED');
    expect((await emailRows(order.id)).map((r) => r.dedupeKey)).toEqual([
      `OrderFulfilled:${order.id}`,
    ]);
  });

  it('an order already FULFILLED gets its OrderFulfilled row at dispatch, PENDING with the first name', async () => {
    const { user, order } = await seedProcessingOrder(OrderStatus.FULFILLED);
    const shipment = await shipments.createForOrder(
      order.id,
      { carrierCode: 'MANUAL', idempotencyKey: `ff-${order.id}` },
      user.id,
    );
    expect(await emailRows(order.id)).toHaveLength(0);

    await dispatch(shipment.id, order.id, user.id, `ffd-${order.id}`);

    const rows = await emailRows(order.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe('PENDING');
    expect(rows[0].payload).toEqual({ orderId: order.id, firstName: 'Ship' });
  });

  it('two admins dispatching at once write one OrderFulfilled row', async () => {
    const { user, order } = await seedProcessingOrder();
    const shipment = await shipments.createForOrder(
      order.id,
      { carrierCode: 'MANUAL', idempotencyKey: `cc-${order.id}` },
      user.id,
    );

    const results = await Promise.allSettled([
      dispatch(shipment.id, order.id, user.id, `da-${order.id}`),
      dispatch(shipment.id, order.id, user.id, `db-${order.id}`),
    ]);

    expect(results.some((r) => r.status === 'fulfilled')).toBe(true);
    const fulfilled = (await emailRows(order.id)).filter((r) =>
      r.dedupeKey?.startsWith('OrderFulfilled:'),
    );
    expect(fulfilled).toHaveLength(1);
  });

  it('the same tracking number on two shipments is refused with the tracking message', async () => {
    const a = await seedProcessingOrder();
    const b = await seedProcessingOrder();
    const shipA = await shipments.createForOrder(
      a.order.id,
      { carrierCode: 'MANUAL', idempotencyKey: `ta-${a.order.id}` },
      a.user.id,
    );
    const shipB = await shipments.createForOrder(
      b.order.id,
      { carrierCode: 'MANUAL', idempotencyKey: `tb-${b.order.id}` },
      b.user.id,
    );
    const tracking = `SHARED-${a.order.id}`;
    await shipments.updateStatus(
      shipA.id,
      {
        status: 'DISPATCHED',
        idempotencyKey: `da-${a.order.id}`,
        trackingNumber: tracking,
      },
      a.user.id,
    );

    await expect(
      shipments.updateStatus(
        shipB.id,
        {
          status: 'DISPATCHED',
          idempotencyKey: `db-${b.order.id}`,
          trackingNumber: tracking,
        },
        b.user.id,
      ),
    ).rejects.toThrow('Tracking number already used for this carrier');
  });

  it('two admins delivering at once write one OrderDelivered row', async () => {
    const { user, order } = await seedProcessingOrder();
    const shipment = await shipments.createForOrder(
      order.id,
      { carrierCode: 'MANUAL', idempotencyKey: `c-${order.id}` },
      user.id,
    );
    await shipments.updateStatus(
      shipment.id,
      {
        status: 'DISPATCHED',
        idempotencyKey: `d-${order.id}`,
        trackingNumber: `TRK-${order.id}`,
      },
      user.id,
    );

    await Promise.allSettled([
      shipments.updateStatus(
        shipment.id,
        { status: 'DELIVERED', idempotencyKey: `deliver-a-${order.id}` },
        user.id,
      ),
      shipments.updateStatus(
        shipment.id,
        { status: 'DELIVERED', idempotencyKey: `deliver-b-${order.id}` },
        user.id,
      ),
    ]);

    const delivered = (await emailRows(order.id)).filter((r) =>
      r.dedupeKey?.startsWith('OrderDelivered:'),
    );
    expect(delivered).toHaveLength(1);
    const finalOrder = await prisma.order.findUniqueOrThrow({
      where: { id: order.id },
    });
    expect(finalOrder.status).toBe(OrderStatus.DELIVERED);
  });
});
