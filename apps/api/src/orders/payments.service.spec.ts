import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PaymentsService } from './payments.service';
import { PrismaService } from '../prisma/prisma.service';
import { ObservabilityService } from '../observability/observability.service';
import { PaystackTransactionClient } from './paystack-transaction.client';
import { PaystackTransientError } from './paystack-transaction.client';
import { OrderStatus, PaymentStatus } from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';

describe('PaymentsService (TTW-012)', () => {
  let service: PaymentsService;
  let prisma: {
    order: { findUnique: jest.Mock };
    payment: {
      findFirst: jest.Mock;
      create: jest.Mock;
      updateMany: jest.Mock;
    };
    $transaction: jest.Mock;
  };
  let paystack: { initialize: jest.Mock };
  let observability: {
    startSpan: jest.Mock;
    recordPaymentInitiation: jest.Mock;
  };

  const order = {
    id: 'ord_1',
    userId: 'user_1',
    status: OrderStatus.PENDING_PAYMENT,
    totalAmount: 2500,
    user: { email: 'cust@example.com' },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma = {
      order: { findUnique: jest.fn().mockResolvedValue(order) },
      payment: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({
          payment: { updateMany: prisma.payment.updateMany },
          order: { update: jest.fn().mockResolvedValue({}) },
        }),
      ),
    };
    paystack = {
      initialize: jest.fn().mockResolvedValue({
        authorizationUrl: 'https://checkout.paystack.com/x',
        reference: 'ref_1',
        accessCode: 'access_1',
      }),
    };
    observability = {
      startSpan: jest.fn(
        async (
          _n: string,
          _a: Record<string, unknown>,
          cb: () => Promise<unknown>,
        ) => cb(),
      ),
      recordPaymentInitiation: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: PrismaService, useValue: prisma },
        { provide: ConfigService, useValue: { get: () => undefined } },
        { provide: ObservabilityService, useValue: observability },
        { provide: PaystackTransactionClient, useValue: paystack },
      ],
    }).compile();

    service = module.get(PaymentsService);
  });

  it('rejects missing order', async () => {
    prisma.order.findUnique.mockResolvedValue(null);
    await expect(
      service.initiatePayment('missing', 'user_1', undefined),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects non-owner', async () => {
    await expect(
      service.initiatePayment('ord_1', 'other', undefined),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('creates a new attempt and calls the provider once', async () => {
    const result = await service.initiatePayment(
      'ord_1',
      'user_1',
      'cust@example.com',
    );
    expect(prisma.payment.create).toHaveBeenCalled();
    expect(paystack.initialize).toHaveBeenCalledTimes(1);
    expect(result.attemptOutcome).toBe('created');
  });

  it('reuses an active INITIATED attempt without calling the provider', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      id: 'pay_1',
      status: PaymentStatus.INITIATED,
      providerRef: 'ref_existing',
      authorizationUrl: 'https://checkout.paystack.com/existing',
      accessCode: 'ac_existing',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    });

    const result = await service.initiatePayment('ord_1', 'user_1', undefined);
    expect(paystack.initialize).not.toHaveBeenCalled();
    expect(result.attemptOutcome).toBe('reused');
    expect(result.reference).toBe('ref_existing');
  });

  it('expires a stale active attempt then creates a new one', async () => {
    prisma.payment.findFirst
      .mockResolvedValueOnce({
        id: 'pay_old',
        status: PaymentStatus.INITIATED,
        providerRef: 'ref_old',
        authorizationUrl: 'https://checkout.paystack.com/old',
        accessCode: 'ac_old',
        expiresAt: new Date(Date.now() - 1_000),
        createdAt: new Date(Date.now() - 120_000),
      })
      .mockResolvedValueOnce(null);

    const result = await service.initiatePayment('ord_1', 'user_1', undefined);
    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: PaymentStatus.FAILED },
      }),
    );
    expect(result.attemptOutcome).toBe('created');
  });

  it('treats null expiresAt as expired when createdAt is old', async () => {
    prisma.payment.findFirst
      .mockResolvedValueOnce({
        id: 'pay_legacy',
        status: PaymentStatus.INITIATED,
        providerRef: 'ref_legacy',
        authorizationUrl: 'https://checkout.paystack.com/legacy',
        accessCode: 'ac_legacy',
        expiresAt: null,
        createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
      })
      .mockResolvedValueOnce(null);

    await service.initiatePayment('ord_1', 'user_1', undefined);
    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: PaymentStatus.FAILED },
      }),
    );
  });

  it('polls PENDING until INITIATED without calling the provider', async () => {
    prisma.payment.findFirst
      .mockResolvedValueOnce({
        id: 'pay_pending',
        status: PaymentStatus.PENDING,
        providerRef: 'ref_pending',
        authorizationUrl: null,
        accessCode: null,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      })
      .mockResolvedValue({
        id: 'pay_pending',
        status: PaymentStatus.INITIATED,
        providerRef: 'ref_pending',
        authorizationUrl: 'https://checkout.paystack.com/ready',
        accessCode: 'ac_ready',
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
      });

    const result = await service.initiatePayment('ord_1', 'user_1', undefined);
    expect(paystack.initialize).not.toHaveBeenCalled();
    expect(result.attemptOutcome).toBe('reused');
    expect(result.authorizationUrl).toContain('ready');
  });

  it('fails stale PENDING and creates a new attempt', async () => {
    prisma.payment.findFirst
      .mockResolvedValueOnce({
        id: 'pay_stale',
        status: PaymentStatus.PENDING,
        providerRef: 'ref_stale',
        authorizationUrl: null,
        accessCode: null,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(Date.now() - 50_000),
      })
      .mockResolvedValueOnce(null);

    const result = await service.initiatePayment('ord_1', 'user_1', undefined);
    expect(result.attemptOutcome).toBe('created');
    expect(paystack.initialize).toHaveBeenCalledTimes(1);
  });

  it('reconciles a lost PENDING response with the same provider ref', async () => {
    const pending = {
      id: 'pay_pending',
      status: PaymentStatus.PENDING,
      providerRef: 'ref_pending',
      authorizationUrl: null,
      accessCode: null,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(Date.now() - 26_000),
    };
    prisma.payment.findFirst.mockResolvedValue(pending);
    paystack.initialize.mockResolvedValue({
      authorizationUrl: 'https://checkout.paystack.com/recon',
      reference: 'ref_pending',
      accessCode: 'ac_recon',
    });

    const result = await service.initiatePayment('ord_1', 'user_1', undefined);
    expect(prisma.payment.create).not.toHaveBeenCalled();
    expect(result.attemptOutcome).toBe('reconciled');
    expect(result.reference).toBe('ref_pending');
  });

  it('attaches to the winner when active-attempt unique conflicts', async () => {
    prisma.payment.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('Unique', {
        code: 'P2002',
        clientVersion: 'test',
      }),
    );
    prisma.payment.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({
      id: 'pay_win',
      status: PaymentStatus.INITIATED,
      providerRef: 'ref_win',
      authorizationUrl: 'https://checkout.paystack.com/win',
      accessCode: 'ac_win',
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
    });

    const result = await service.initiatePayment('ord_1', 'user_1', undefined);
    expect(paystack.initialize).not.toHaveBeenCalled();
    expect(result.attemptOutcome).toBe('reused');
  });

  it('marks FAILED and throws on hard provider 4xx for the winner only', async () => {
    paystack.initialize.mockRejectedValue(
      new BadRequestException('Invalid email'),
    );
    await expect(
      service.initiatePayment('ord_1', 'user_1', undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PaymentStatus.FAILED }),
      }),
    );
  });

  it('does not fail the attempt on duplicate-reference during reconcile', async () => {
    prisma.payment.findFirst.mockResolvedValue({
      id: 'pay_pending',
      status: PaymentStatus.PENDING,
      providerRef: 'ref_pending',
      authorizationUrl: null,
      accessCode: null,
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(Date.now() - 26_000),
    });
    paystack.initialize.mockRejectedValue(
      new BadRequestException('Duplicate Transaction Reference'),
    );
    await expect(
      service.initiatePayment('ord_1', 'user_1', undefined),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.payment.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: PaymentStatus.FAILED }),
      }),
    );
  });

  it('hard-fails only PENDING rows, never wiping INITIATED', async () => {
    prisma.payment.findFirst.mockResolvedValue(null);
    paystack.initialize.mockRejectedValue(
      new BadRequestException('Invalid email'),
    );
    await expect(
      service.initiatePayment('ord_1', 'user_1', undefined),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.payment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: PaymentStatus.PENDING }),
        data: expect.objectContaining({ status: PaymentStatus.FAILED }),
      }),
    );
  });

  it('leaves PENDING and returns 409 on transient provider errors', async () => {
    paystack.initialize.mockRejectedValue(
      new PaystackTransientError('Paystack initialize failed (503)'),
    );
    await expect(
      service.initiatePayment('ord_1', 'user_1', undefined),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(observability.recordPaymentInitiation).toHaveBeenCalledWith({
      outcome: 'blocked',
    });
  });
});
