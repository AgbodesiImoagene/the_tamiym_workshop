import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { PayoutRunsService } from './payout-runs.service';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignLedgerService } from './campaign-ledger.service';
import { PayoutsService } from './payouts.service';
import { AuditService } from '../audit/audit.service';
import { ObservabilityService } from '../observability/observability.service';
import { PayoutStatus } from '../generated/prisma/enums';

describe('PayoutRunsService.retryPayout', () => {
  let service: PayoutRunsService;
  let prisma: {
    $transaction: jest.Mock;
    payout: { findUnique: jest.Mock };
  };
  let campaignLedger: { getNetLedgerAmountForPayout: jest.Mock };
  let executeSinglePayout: jest.Mock;

  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(0),
    payout: {
      findUnique: jest.fn(),
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    payoutRun: { update: jest.fn().mockResolvedValue({}) },
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    executeSinglePayout = jest.fn().mockResolvedValue(undefined);
    prisma = {
      $transaction: jest.fn(
        async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
      ),
      payout: { findUnique: jest.fn() },
    };
    campaignLedger = {
      getNetLedgerAmountForPayout: jest.fn().mockResolvedValue(0),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayoutRunsService,
        { provide: PrismaService, useValue: prisma },
        { provide: CampaignLedgerService, useValue: campaignLedger },
        {
          provide: PayoutsService,
          useValue: {
            initiateTransfer: jest.fn(),
            resolveRecipient: jest.fn(),
          },
        },
        { provide: AuditService, useValue: { log: jest.fn() } },
        {
          provide: ObservabilityService,
          useValue: { recordPayoutRun: jest.fn(), startSpan: jest.fn() },
        },
      ],
    }).compile();

    service = module.get(PayoutRunsService);
    jest
      .spyOn(service, 'executeSinglePayout')
      .mockImplementation(executeSinglePayout);
  });

  it('creates a successor payout, cancels the original, and reopens the run', async () => {
    tx.payout.findUnique.mockResolvedValue({
      id: 'old-1',
      status: PayoutStatus.FAILED,
      payoutRunId: 'run-1',
      campaignId: 'c1',
      recipientUserId: 'u1',
      provider: 'PAYSTACK',
      currency: 'NGN',
      amount: 100,
    });
    tx.payout.create.mockResolvedValue({
      id: 'new-1',
      status: PayoutStatus.QUEUED,
      payoutRunId: 'run-1',
    });
    tx.payout.findMany.mockResolvedValue([{ status: PayoutStatus.INITIATED }]);
    prisma.payout.findUnique.mockResolvedValue({
      id: 'new-1',
      status: PayoutStatus.INITIATED,
    });

    await expect(service.retryPayout('old-1')).resolves.toEqual({
      id: 'new-1',
      status: PayoutStatus.INITIATED,
    });

    expect(tx.payout.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'old-1' },
        data: expect.objectContaining({ status: PayoutStatus.CANCELLED }),
      }),
    );
    expect(tx.payoutRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'run-1' },
        data: expect.objectContaining({ status: 'EXECUTING' }),
      }),
    );
    expect(executeSinglePayout).toHaveBeenCalledWith('new-1');
  });

  it('re-completes the run when executeSinglePayout fails inline', async () => {
    tx.payout.findUnique.mockResolvedValue({
      id: 'old-1',
      status: PayoutStatus.FAILED,
      payoutRunId: 'run-1',
      campaignId: 'c1',
      recipientUserId: 'u1',
      provider: 'PAYSTACK',
      currency: 'NGN',
      amount: 100,
    });
    tx.payout.create.mockResolvedValue({
      id: 'new-1',
      status: PayoutStatus.QUEUED,
      payoutRunId: 'run-1',
    });
    executeSinglePayout.mockRejectedValue(new Error('Paystack down'));
    tx.payout.findMany.mockResolvedValue([
      { status: PayoutStatus.CANCELLED },
      { status: PayoutStatus.FAILED },
    ]);
    prisma.payout.findUnique.mockResolvedValue({
      id: 'new-1',
      status: PayoutStatus.FAILED,
    });

    await expect(service.retryPayout('old-1')).rejects.toThrow('Paystack down');
    expect(tx.payoutRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'COMPLETED' }),
      }),
    );
  });

  it('reuses the original Paystack idempotency key when providerRef is null', async () => {
    tx.payout.findUnique.mockResolvedValue({
      id: 'old-1',
      status: PayoutStatus.FAILED,
      payoutRunId: 'run-1',
      campaignId: 'c1',
      recipientUserId: 'u1',
      provider: 'PAYSTACK',
      currency: 'NGN',
      amount: 100,
      providerRef: null,
      idempotencyKey: 'payout-old-1',
    });
    tx.payout.create.mockResolvedValue({
      id: 'new-1',
      status: PayoutStatus.QUEUED,
      payoutRunId: 'run-1',
      idempotencyKey: 'payout-old-1',
    });
    tx.payout.findMany.mockResolvedValue([{ status: PayoutStatus.INITIATED }]);
    prisma.payout.findUnique.mockResolvedValue({
      id: 'new-1',
      status: PayoutStatus.INITIATED,
    });

    await service.retryPayout('old-1');

    expect(tx.payout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ idempotencyKey: 'payout-old-1' }),
      }),
    );
  });

  it('mints a fresh idempotency key when retrying a webhook-failed payout', async () => {
    tx.payout.findUnique.mockResolvedValue({
      id: 'old-1',
      status: PayoutStatus.FAILED,
      payoutRunId: 'run-1',
      campaignId: 'c1',
      recipientUserId: 'u1',
      provider: 'PAYSTACK',
      currency: 'NGN',
      amount: 100,
      providerRef: 'trf_failed',
      idempotencyKey: 'payout-old-1',
    });
    tx.payout.create.mockResolvedValue({
      id: 'new-1',
      status: PayoutStatus.QUEUED,
      payoutRunId: 'run-1',
    });
    tx.payout.findMany.mockResolvedValue([{ status: PayoutStatus.INITIATED }]);
    prisma.payout.findUnique.mockResolvedValue({
      id: 'new-1',
      status: PayoutStatus.INITIATED,
    });

    await service.retryPayout('old-1');

    expect(tx.payout.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ idempotencyKey: undefined }),
      }),
    );
  });

  it('rejects a second retry of the superseded original', async () => {
    tx.payout.findUnique.mockResolvedValue({
      id: 'old-1',
      status: PayoutStatus.CANCELLED,
      payoutRunId: 'run-1',
    });

    await expect(service.retryPayout('old-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(tx.payout.create).not.toHaveBeenCalled();
  });
});
