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
