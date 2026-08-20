import { ReconciliationRunsService } from './reconciliation-runs.service';
import { PaystackReconciliationClient } from './paystack-reconciliation.client';
import {
  LedgerEntryType,
  PayoutStatus,
  ReconciliationOutcome,
  ReconciliationSeverity,
} from '../generated/prisma/enums';

describe('ReconciliationRunsService payout checks', () => {
  function buildService(prisma: Record<string, unknown>) {
    return new ReconciliationRunsService(
      prisma as never,
      {
        startSpan: (_n: string, _a: unknown, fn: () => unknown) => fn(),
      } as never,
      {
        listTransactions: jest.fn(),
        listRefunds: jest.fn(),
        listTransfers: jest.fn(),
      } as unknown as PaystackReconciliationClient,
    );
  }

  it('does not flag a normal SUCCEEDED payout with reserve net -amount', async () => {
    const payouts = [
      {
        id: 'p1',
        status: PayoutStatus.SUCCEEDED,
        amount: 5000,
        currency: 'NGN',
        createdAt: new Date('2020-01-01'),
      },
    ];
    const prisma = {
      withSessionAdvisoryLock: jest.fn(
        async (_k: string, fn: () => Promise<unknown>) => fn(),
      ),
      reconciliationRun: {
        upsert: jest.fn().mockResolvedValue({
          id: 'run1',
          status: 'RUNNING',
        }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'run1',
            ...data,
          }),
        ),
        findUniqueOrThrow: jest.fn(),
      },
      reconciliationFinding: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn(),
        count: jest.fn().mockResolvedValue(0),
      },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      refund: { findMany: jest.fn().mockResolvedValue([]) },
      campaign: { findMany: jest.fn().mockResolvedValue([]) },
      inventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
      payout: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(payouts)
          .mockResolvedValue([]),
      },
      campaignBalanceLedgerEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: -5000 } }),
        count: jest.fn(),
      },
    };

    const service = buildService(prisma);
    const run = await service.runInternal(new Date('2026-08-20'));
    expect(run?.status).toBe('COMPLETED');
    expect(prisma.reconciliationFinding.create).not.toHaveBeenCalled();
  });

  it('flags SUCCEEDED payout when ledger net is wrong', async () => {
    const payouts = [
      {
        id: 'p2',
        status: PayoutStatus.SUCCEEDED,
        amount: 5000,
        currency: 'NGN',
        createdAt: new Date('2020-01-01'),
      },
    ];
    const prisma = {
      withSessionAdvisoryLock: jest.fn(
        async (_k: string, fn: () => Promise<unknown>) => fn(),
      ),
      reconciliationRun: {
        upsert: jest.fn().mockResolvedValue({
          id: 'run2',
          status: 'RUNNING',
        }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'run2',
            ...data,
          }),
        ),
        findUniqueOrThrow: jest.fn(),
      },
      reconciliationFinding: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(1),
      },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      refund: { findMany: jest.fn().mockResolvedValue([]) },
      campaign: { findMany: jest.fn().mockResolvedValue([]) },
      inventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
      payout: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(payouts)
          .mockResolvedValue([]),
      },
      campaignBalanceLedgerEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
        count: jest.fn(),
      },
    };

    const service = buildService(prisma);
    await service.runInternal(new Date('2026-08-20'));
    expect(prisma.reconciliationFinding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          outcome: ReconciliationOutcome.MISMATCH,
          severity: ReconciliationSeverity.CRITICAL,
          leftValue: '-5000',
          rightValue: '0',
        }),
      }),
    );
    expect(LedgerEntryType.PAYOUT_RESERVED).toBeDefined();
  });

  it('flags FAILED payout when ledger net is not released to 0', async () => {
    const payouts = [
      {
        id: 'p3',
        status: PayoutStatus.FAILED,
        amount: 3000,
        currency: 'NGN',
        createdAt: new Date('2020-01-01'),
      },
    ];
    const prisma = {
      withSessionAdvisoryLock: jest.fn(
        async (_k: string, fn: () => Promise<unknown>) => fn(),
      ),
      reconciliationRun: {
        upsert: jest.fn().mockResolvedValue({ id: 'run3', status: 'RUNNING' }),
        update: jest
          .fn()
          .mockImplementation(({ data }) =>
            Promise.resolve({ id: 'run3', ...data }),
          ),
        findUniqueOrThrow: jest.fn(),
      },
      reconciliationFinding: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        count: jest.fn().mockResolvedValue(1),
      },
      payment: { findMany: jest.fn().mockResolvedValue([]) },
      refund: { findMany: jest.fn().mockResolvedValue([]) },
      campaign: { findMany: jest.fn().mockResolvedValue([]) },
      inventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
      payout: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce(payouts)
          .mockResolvedValue([]),
      },
      campaignBalanceLedgerEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: -3000 } }),
        count: jest.fn(),
      },
    };

    const service = buildService(prisma);
    await service.runInternal(new Date('2026-08-20'));
    expect(prisma.reconciliationFinding.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          leftValue: '0',
          rightValue: '-3000',
          severity: ReconciliationSeverity.CRITICAL,
        }),
      }),
    );
  });
});

describe('PaystackReconciliationClient fail-closed', () => {
  it('marks incomplete when secret key missing', async () => {
    const client = new PaystackReconciliationClient({
      get: () => undefined,
    } as never);
    const result = await client.listTransactions({
      fromIso: '2026-08-01T00:00:00.000Z',
      toIso: '2026-08-20T00:00:00.000Z',
    });
    expect(result.complete).toBe(false);
    expect(result.errorSummary).toMatch(/PAYSTACK_SECRET_KEY/);
  });

  it('marks incomplete when a page contains NaN amounts', async () => {
    const client = new PaystackReconciliationClient({
      get: () => 'sk_test',
    } as never);
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          status: true,
          data: [
            {
              id: 1,
              reference: 'ref1',
              status: 'success',
              amount: 'not-a-number',
              currency: 'NGN',
            },
          ],
          meta: { page: 1, pageCount: 1 },
        }),
    } as never);

    const result = await client.listTransactions({
      fromIso: '2026-08-01',
      toIso: '2026-08-20',
    });
    expect(result.complete).toBe(false);
    expect(result.errorSummary).toMatch(/malformed/i);
    fetchMock.mockRestore();
  });
});

describe('PaystackReconciliationClient success path', () => {
  it('paginates transactions refunds and transfers when complete', async () => {
    const client = new PaystackReconciliationClient({
      get: () => 'sk_test',
    } as never);
    const payload = {
      status: true,
      data: [
        {
          id: 9,
          reference: 'ok_ref',
          status: 'success',
          amount: 1000,
          currency: 'NGN',
        },
      ],
      meta: { page: 1, pageCount: 1 },
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(payload),
    } as never);
    await expect(
      client.listTransactions({ fromIso: '2026-08-01', toIso: '2026-08-20' }),
    ).resolves.toEqual(
      expect.objectContaining({ complete: true, pagesFetched: 1 }),
    );
    await expect(
      client.listRefunds({ fromIso: '2026-08-01', toIso: '2026-08-20' }),
    ).resolves.toEqual(expect.objectContaining({ complete: true }));
    await expect(
      client.listTransfers({ fromIso: '2026-08-01', toIso: '2026-08-20' }),
    ).resolves.toEqual(expect.objectContaining({ complete: true }));
    fetchMock.mockRestore();
  });
});

describe('checkAgainstProvider matching', () => {
  it('flags amount mismatch and provider-only success as MISSING_INTERNAL', async () => {
    const now = new Date('2026-08-20T12:00:00.000Z');
    const from = new Date('2026-08-13T00:00:00.000Z');
    const prisma = {
      payment: {
        findMany: jest
          .fn()
          .mockResolvedValueOnce([
            {
              id: 'pay1',
              orderId: 'o1',
              amount: 10,
              currency: 'NGN',
              providerRef: 'ref_local',
              createdAt: now,
            },
          ])
          .mockResolvedValue([]),
      },
      refund: { findMany: jest.fn().mockResolvedValue([]) },
      payout: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ReconciliationRunsService(
      prisma as never,
      {
        startSpan: (_n: string, _a: unknown, fn: () => unknown) => fn(),
      } as never,
      {} as never,
    );
    const result = await (
      service as unknown as {
        checkAgainstProvider: (
          cutoff: Date,
          snapshot: {
            transactions: Array<{
              reference: string;
              status: string;
              amountKobo: number;
              currency: string;
            }>;
            refunds: [];
            transfers: [];
          },
          from: Date,
        ) => Promise<{
          findings: Array<{ outcome: string; leftValue: string }>;
        }>;
      }
    ).checkAgainstProvider(
      now,
      {
        transactions: [
          {
            reference: 'ref_local',
            status: 'success',
            amountKobo: 999,
            currency: 'NGN',
          },
          {
            reference: 'ref_provider_only',
            status: 'success',
            amountKobo: 100,
            currency: 'NGN',
          },
        ],
        refunds: [],
        transfers: [],
      },
      from,
    );
    expect(
      result.findings.some(
        (f) =>
          f.outcome === ReconciliationOutcome.MISMATCH &&
          f.leftValue.includes('1000'),
      ),
    ).toBe(true);
    expect(
      result.findings.some(
        (f) =>
          f.outcome === ReconciliationOutcome.MISSING_INTERNAL &&
          f.leftValue === 'ref_provider_only',
      ),
    ).toBe(true);
  });
});

function emptyPrismaForRun(runId = 'runX') {
  return {
    withSessionAdvisoryLock: jest.fn(
      async (_k: string, fn: () => Promise<unknown>) => fn(),
    ),
    reconciliationRun: {
      upsert: jest.fn().mockResolvedValue({
        id: runId,
        status: 'RUNNING',
      }),
      update: jest.fn().mockImplementation(({ data }) =>
        Promise.resolve({
          id: runId,
          ...data,
        }),
      ),
      findUniqueOrThrow: jest.fn().mockImplementation(() =>
        Promise.resolve({
          id: runId,
          status: 'INCOMPLETE',
        }),
      ),
    },
    reconciliationFinding: {
      findFirst: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'f1' }),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0),
      findUniqueOrThrow: jest.fn(),
    },
    payment: { findMany: jest.fn().mockResolvedValue([]) },
    refund: { findMany: jest.fn().mockResolvedValue([]) },
    payout: { findMany: jest.fn().mockResolvedValue([]) },
    campaign: { findMany: jest.fn().mockResolvedValue([]) },
    inventoryItem: { findMany: jest.fn().mockResolvedValue([]) },
    inventoryMovement: { findMany: jest.fn().mockResolvedValue([]) },
    campaignBalanceLedgerEntry: {
      aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 0 } }),
      count: jest.fn().mockResolvedValue(0),
    },
  };
}

describe('ReconciliationRunsService.runProvider', () => {
  it('marks INCOMPLETE when forceIncomplete is set', async () => {
    const prisma = emptyPrismaForRun('run-force');
    const paystack = {
      listTransactions: jest.fn(),
      listRefunds: jest.fn(),
      listTransfers: jest.fn(),
    };
    const service = new ReconciliationRunsService(
      prisma as never,
      {
        startSpan: (_n: string, _a: unknown, fn: () => unknown) => fn(),
      } as never,
      paystack as never,
    );
    const run = await service.runProvider(new Date('2026-08-20T12:00:00Z'), {
      forceIncomplete: true,
    });
    expect(run?.status).toBe('INCOMPLETE');
    expect(paystack.listTransactions).not.toHaveBeenCalled();
  });

  it('marks INCOMPLETE when provider pagination is incomplete', async () => {
    const prisma = emptyPrismaForRun('run-inc');
    const paystack = {
      listTransactions: jest.fn().mockResolvedValue({
        complete: false,
        errorSummary: 'page fail',
        pagesFetched: 1,
        items: [],
      }),
      listRefunds: jest.fn().mockResolvedValue({
        complete: true,
        pagesFetched: 1,
        items: [],
      }),
      listTransfers: jest.fn().mockResolvedValue({
        complete: true,
        pagesFetched: 1,
        items: [],
      }),
    };
    const service = new ReconciliationRunsService(
      prisma as never,
      {
        startSpan: (_n: string, _a: unknown, fn: () => unknown) => fn(),
      } as never,
      paystack as never,
    );
    const run = await service.runProvider(new Date('2026-08-20T12:00:00Z'));
    expect(run?.status).toBe('INCOMPLETE');
    expect(prisma.reconciliationRun.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'INCOMPLETE',
          errorSummary: 'page fail',
        }),
      }),
    );
  });

  it('completes provider run with snapshot checks', async () => {
    const cutoff = new Date('2026-08-20T12:00:00.000Z');
    const prisma = emptyPrismaForRun('run-ok');
    prisma.payment.findMany = jest
      .fn()
      .mockResolvedValueOnce([]) // internal payments
      .mockResolvedValueOnce([
        {
          id: 'pay1',
          orderId: 'o1',
          amount: 10,
          currency: 'NGN',
          providerRef: 'ref_ok',
          createdAt: cutoff,
        },
        {
          id: 'pay2',
          orderId: 'o2',
          amount: 5,
          currency: 'NGN',
          providerRef: null,
          createdAt: cutoff,
        },
        {
          id: 'pay3',
          orderId: 'o3',
          amount: 1,
          currency: 'NGN',
          providerRef: 'ref_missing',
          createdAt: new Date(cutoff.getTime() - 48 * 60 * 60 * 1000),
        },
      ])
      .mockResolvedValue([]);
    prisma.refund.findMany = jest
      .fn()
      .mockResolvedValueOnce([]) // internal
      .mockResolvedValueOnce([
        {
          id: 'rf1',
          amount: 2,
          currency: 'NGN',
          providerRef: '11',
          createdAt: cutoff,
        },
        {
          id: 'rf2',
          amount: 1,
          currency: 'NGN',
          providerRef: null,
          createdAt: cutoff,
        },
      ])
      .mockResolvedValue([]);
    prisma.payout.findMany = jest
      .fn()
      .mockResolvedValueOnce([]) // internal
      .mockResolvedValueOnce([
        {
          id: 'po1',
          amount: 3,
          currency: 'NGN',
          providerRef: 'xfer_ok',
          createdAt: cutoff,
          status: PayoutStatus.SUCCEEDED,
        },
      ])
      .mockResolvedValue([]);

    const paystack = {
      listTransactions: jest.fn().mockResolvedValue({
        complete: true,
        pagesFetched: 1,
        items: [
          {
            reference: 'ref_ok',
            status: 'success',
            amountKobo: 1000,
            currency: 'NGN',
          },
          {
            reference: 'ref_only_provider',
            status: 'success',
            amountKobo: 50,
            currency: 'NGN',
          },
        ],
      }),
      listRefunds: jest.fn().mockResolvedValue({
        complete: true,
        pagesFetched: 1,
        items: [
          {
            id: 11,
            status: 'processed',
            amountKobo: 200,
            currency: 'NGN',
          },
        ],
      }),
      listTransfers: jest.fn().mockResolvedValue({
        complete: true,
        pagesFetched: 1,
        items: [
          {
            reference: 'xfer_ok',
            status: 'success',
            amountKobo: 300,
            currency: 'NGN',
          },
        ],
      }),
    };
    const service = new ReconciliationRunsService(
      prisma as never,
      {
        startSpan: (_n: string, _a: unknown, fn: () => unknown) => fn(),
      } as never,
      paystack as never,
    );
    const run = await service.runProvider(cutoff);
    expect(run?.status).toBe('COMPLETED');
    expect(prisma.reconciliationFinding.create).toHaveBeenCalled();
  });

  it('returns null when advisory lock is held', async () => {
    const prisma = emptyPrismaForRun();
    prisma.withSessionAdvisoryLock = jest.fn().mockResolvedValue(null);
    const service = new ReconciliationRunsService(
      prisma as never,
      {
        startSpan: (_n: string, _a: unknown, fn: () => unknown) => fn(),
      } as never,
      {
        listTransactions: jest.fn(),
        listRefunds: jest.fn(),
        listTransfers: jest.fn(),
      } as never,
    );
    await expect(
      service.runProvider(new Date('2026-08-20T12:00:00Z')),
    ).resolves.toBeNull();
  });
});

describe('ReconciliationRunsService internal domain findings', () => {
  it('flags payment claim and order mismatches', async () => {
    const prisma = emptyPrismaForRun('run-pay');
    prisma.payment.findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'p1',
          orderId: 'o1',
          amount: 10,
          currency: 'NGN',
          settlementClaim: null,
          order: { id: 'o1', status: 'DRAFT', paymentStatus: 'PENDING' },
        },
      ])
      .mockResolvedValue([]);
    const service = new ReconciliationRunsService(
      prisma as never,
      {
        startSpan: (_n: string, _a: unknown, fn: () => unknown) => fn(),
      } as never,
      {} as never,
    );
    await service.runInternal(new Date('2026-08-20'));
    expect(prisma.reconciliationFinding.create).toHaveBeenCalled();
  });

  it('flags refund claim and ledger issues', async () => {
    const prisma = emptyPrismaForRun('run-rf');
    prisma.refund.findMany = jest
      .fn()
      .mockResolvedValueOnce([
        {
          id: 'r1',
          orderId: 'o1',
          amount: 5,
          currency: 'NGN',
          settlementClaim: null,
          order: { campaignId: 'c1' },
        },
      ])
      .mockResolvedValue([]);
    prisma.campaignBalanceLedgerEntry.count = jest.fn().mockResolvedValue(0);
    const service = new ReconciliationRunsService(
      prisma as never,
      {
        startSpan: (_n: string, _a: unknown, fn: () => unknown) => fn(),
      } as never,
      {} as never,
    );
    await service.runInternal(new Date('2026-08-20'));
    expect(prisma.reconciliationFinding.create).toHaveBeenCalled();
  });

  it('flags campaign currentAmount drift and inventory reserved drift', async () => {
    const prisma = emptyPrismaForRun('run-ci');
    prisma.campaign.findMany = jest
      .fn()
      .mockResolvedValueOnce([{ id: 'c1', currentAmount: 100 }])
      .mockResolvedValue([]);
    prisma.campaignBalanceLedgerEntry.aggregate = jest
      .fn()
      .mockResolvedValue({ _sum: { amount: 50 } });
    prisma.inventoryItem.findMany = jest
      .fn()
      .mockResolvedValueOnce([{ variantId: 'v1', stockOnHand: 5, reserved: 3 }])
      .mockResolvedValue([]);
    prisma.inventoryMovement.findMany = jest
      .fn()
      .mockResolvedValue([
        { reservedDelta: 1, stockOnHandDelta: 0, kind: 'RESERVE' },
      ]);
    const service = new ReconciliationRunsService(
      prisma as never,
      {
        startSpan: (_n: string, _a: unknown, fn: () => unknown) => fn(),
      } as never,
      {} as never,
    );
    await service.runInternal(new Date('2026-08-20'));
    expect(prisma.reconciliationFinding.create).toHaveBeenCalled();
  });

  it('runTargeted filters to finding domain', async () => {
    const prisma = emptyPrismaForRun('run-t');
    prisma.reconciliationFinding.findUniqueOrThrow = jest
      .fn()
      .mockResolvedValue({
        id: 'f1',
        domain: 'CAMPAIGN',
        fingerprint: 'fp',
      });
    prisma.campaign.findMany = jest.fn().mockResolvedValue([]);
    const service = new ReconciliationRunsService(
      prisma as never,
      {
        startSpan: (_n: string, _a: unknown, fn: () => unknown) => fn(),
      } as never,
      {} as never,
    );
    const run = await service.runTargeted('f1');
    expect(run.status).toBe('COMPLETED');
    expect(prisma.payment.findMany).not.toHaveBeenCalled();
    expect(prisma.campaign.findMany).toHaveBeenCalled();
  });

  it('marks FAILED when a check throws', async () => {
    const prisma = emptyPrismaForRun('run-fail');
    prisma.payment.findMany = jest.fn().mockRejectedValue(new Error('db down'));
    const service = new ReconciliationRunsService(
      prisma as never,
      {
        startSpan: (_n: string, _a: unknown, fn: () => unknown) => fn(),
      } as never,
      {} as never,
    );
    const run = await service.runInternal(new Date('2026-08-20'));
    expect(run?.status).toBe('FAILED');
  });
});
