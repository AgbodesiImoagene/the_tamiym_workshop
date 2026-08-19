import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SchedulerRegistry } from '@nestjs/schedule';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Request } from 'express';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/prisma/prisma.service';
import { PaymentsService } from '../src/orders/payments.service';
import {
  PaystackTransactionClient,
  PaystackInitializeResult,
} from '../src/orders/paystack-transaction.client';
import {
  OrderStatus,
  PaymentStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';
import { closeE2eApp } from './utils/create-e2e-app';

/**
 * Delayed provider that counts initialize calls. Same reference always returns
 * the same authorization session (Idempotency-Key semantics).
 */
class DelayedPaystackClient {
  calls = 0;
  private readonly delayMs: number;
  private readonly sessions = new Map<string, PaystackInitializeResult>();

  constructor(delayMs = 50) {
    this.delayMs = delayMs;
  }

  async initialize(params: {
    reference: string;
  }): Promise<PaystackInitializeResult> {
    this.calls += 1;
    await new Promise((r) => setTimeout(r, this.delayMs));
    const existing = this.sessions.get(params.reference);
    if (existing) return existing;
    const created: PaystackInitializeResult = {
      authorizationUrl: `https://checkout.paystack.test/${params.reference}`,
      reference: params.reference,
      accessCode: `ac_${params.reference.slice(-8)}`,
    };
    this.sessions.set(params.reference, created);
    return created;
  }
}

describe('Payment initiation serialization (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let payments: PaymentsService;
  let paystack: DelayedPaystackClient;

  beforeAll(async () => {
    paystack = new DelayedPaystackClient(80);
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PaystackTransactionClient)
      .useValue(paystack)
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.use(
      express.json({
        verify: (req: Request & { rawBody?: Buffer }, _res, buf: Buffer) => {
          req.rawBody = buf;
        },
      }),
    );
    app.use(cookieParser());
    app.setGlobalPrefix('v1');
    app.enableShutdownHooks();
    await app.init();

    try {
      const registry = app.get(SchedulerRegistry, { strict: false });
      for (const name of [...registry.getCronJobs().keys()]) {
        registry.deleteCronJob(name);
      }
    } catch {
      // no scheduler
    }

    prisma = app.get(PrismaService);
    payments = app.get(PaymentsService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function seedPendingOrder(suffix: string) {
    const passwordHash = await bcrypt.hash('TestPassword1!', 10);
    const customer = await prisma.user.create({
      data: {
        email: `cust-init-${suffix}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Cust',
        lastName: 'Init',
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
        paymentStatus: PaymentStatus.PENDING,
        currency: 'NGN',
        subtotalAmount: 3000,
        totalAmount: 3000,
        shipLine1: address.addressLine1,
        shipCity: address.city,
        shipState: address.state,
        shipCountry: 'Nigeria',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });
    return { customer, order };
  }

  it('fifty concurrent initiates produce one payment and one provider session', async () => {
    const suffix = `conc-${Date.now()}`;
    const { customer, order } = await seedPendingOrder(suffix);
    paystack.calls = 0;

    const results = await Promise.all(
      Array.from({ length: 50 }, () =>
        payments.initiatePayment(order.id, customer.id, customer.email),
      ),
    );

    const refs = new Set(results.map((r) => r.reference));
    const urls = new Set(results.map((r) => r.authorizationUrl));
    expect(refs.size).toBe(1);
    expect(urls.size).toBe(1);

    const active = await prisma.payment.findMany({
      where: {
        orderId: order.id,
        status: { in: [PaymentStatus.PENDING, PaymentStatus.INITIATED] },
      },
    });
    expect(active).toHaveLength(1);
    expect(active[0].status).toBe(PaymentStatus.INITIATED);
    // Single-flight: only the reserve winner calls the provider.
    expect(paystack.calls).toBe(1);
  });

  it('retry reuses the same authorization URL', async () => {
    const suffix = `reuse-${Date.now()}`;
    const { customer, order } = await seedPendingOrder(suffix);
    const first = await payments.initiatePayment(
      order.id,
      customer.id,
      customer.email,
    );
    const second = await payments.initiatePayment(
      order.id,
      customer.id,
      customer.email,
    );
    expect(second.attemptOutcome).toBe('reused');
    expect(second.reference).toBe(first.reference);
    expect(second.authorizationUrl).toBe(first.authorizationUrl);
  });
});
