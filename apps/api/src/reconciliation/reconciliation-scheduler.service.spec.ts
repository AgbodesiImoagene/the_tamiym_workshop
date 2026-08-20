import { ReconciliationSchedulerService } from './reconciliation-scheduler.service';
import { ReconciliationRunStatus } from '../generated/prisma/enums';

describe('ReconciliationSchedulerService', () => {
  it('emits when internal run has open findings', async () => {
    const runs = {
      runInternal: jest.fn().mockResolvedValue({
        id: 'r1',
        kind: 'INTERNAL',
        status: ReconciliationRunStatus.COMPLETED,
        findingsOpen: 2,
      }),
      runProvider: jest.fn(),
    };
    const adminNotify = { emit: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      reconciliationRun: { findUnique: jest.fn(), deleteMany: jest.fn() },
      reconciliationFinding: { count: jest.fn().mockResolvedValue(0) },
    };
    const service = new ReconciliationSchedulerService(
      runs as never,
      {
        startSpan: (_n: string, _a: unknown, fn: () => unknown) => fn(),
      } as never,
      adminNotify as never,
      prisma as never,
    );

    await service.runInternalNightly();
    expect(adminNotify.emit).toHaveBeenCalled();
  });

  it('emits when provider run is incomplete', async () => {
    const runs = {
      runInternal: jest.fn(),
      runProvider: jest.fn().mockResolvedValue({
        id: 'r2',
        kind: 'PROVIDER',
        status: ReconciliationRunStatus.INCOMPLETE,
        findingsOpen: 0,
      }),
    };
    const adminNotify = { emit: jest.fn().mockResolvedValue(undefined) };
    const service = new ReconciliationSchedulerService(
      runs as never,
      {
        startSpan: (_n: string, _a: unknown, fn: () => unknown) => fn(),
      } as never,
      adminNotify as never,
      {
        reconciliationRun: { findUnique: jest.fn(), deleteMany: jest.fn() },
        reconciliationFinding: { count: jest.fn() },
      } as never,
    );

    await service.runProviderDaily();
    expect(adminNotify.emit).toHaveBeenCalled();
  });

  it('purges runs older than retention', async () => {
    const prisma = {
      reconciliationRun: {
        findUnique: jest.fn(),
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      reconciliationFinding: { count: jest.fn() },
    };
    const service = new ReconciliationSchedulerService(
      { runInternal: jest.fn(), runProvider: jest.fn() } as never,
      {
        startSpan: (_n: string, _a: unknown, fn: () => unknown) => fn(),
      } as never,
      { emit: jest.fn() } as never,
      prisma as never,
    );
    await service.purgeExpiredRuns();
    expect(prisma.reconciliationRun.deleteMany).toHaveBeenCalled();
  });

  it('monitorMissedAndStale emits for missed windows and stale critical', async () => {
    const adminNotify = { emit: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      reconciliationRun: {
        findUnique: jest.fn().mockResolvedValue(null),
        deleteMany: jest.fn(),
      },
      reconciliationFinding: { count: jest.fn().mockResolvedValue(2) },
    };
    const service = new ReconciliationSchedulerService(
      { runInternal: jest.fn(), runProvider: jest.fn() } as never,
      {
        startSpan: (_n: string, _a: unknown, fn: () => unknown) => fn(),
      } as never,
      adminNotify as never,
      prisma as never,
    );

    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-08-20T10:00:00.000Z')); // Lagos ~11:00
    await service.monitorMissedAndStale();
    expect(adminNotify.emit).toHaveBeenCalled();
    jest.useRealTimers();
  });

  it('skips notify when runInternal returns null (lock held)', async () => {
    const adminNotify = { emit: jest.fn() };
    const service = new ReconciliationSchedulerService(
      {
        runInternal: jest.fn().mockResolvedValue(null),
        runProvider: jest.fn(),
      } as never,
      {
        startSpan: (_n: string, _a: unknown, fn: () => unknown) => fn(),
      } as never,
      adminNotify as never,
      {
        reconciliationRun: { findUnique: jest.fn(), deleteMany: jest.fn() },
        reconciliationFinding: { count: jest.fn() },
      } as never,
    );
    await service.runInternalNightly();
    expect(adminNotify.emit).not.toHaveBeenCalled();
  });
});
