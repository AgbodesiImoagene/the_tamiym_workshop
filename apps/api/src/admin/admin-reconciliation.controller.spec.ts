import { StreamableFile } from '@nestjs/common';
import { AdminReconciliationController } from '../admin/admin-reconciliation.controller';
import {
  ReconciliationFindingStatus,
  ReconciliationRunKind,
  ReconciliationRunStatus,
} from '../generated/prisma/enums';

describe('AdminReconciliationController', () => {
  function build(overrides?: {
    runs?: Record<string, jest.Mock>;
    repairs?: Record<string, jest.Mock>;
    prisma?: Record<string, unknown>;
  }) {
    const audit = { log: jest.fn().mockResolvedValue(undefined) };
    const runs = {
      runInternal: jest.fn().mockResolvedValue({
        id: 'run1',
        status: ReconciliationRunStatus.COMPLETED,
      }),
      runProvider: jest.fn().mockResolvedValue({
        id: 'run2',
        status: ReconciliationRunStatus.INCOMPLETE,
      }),
      ...(overrides?.runs ?? {}),
    };
    const repairs = {
      requestRepair: jest.fn().mockResolvedValue({ id: 'rep1' }),
      approveAndApply: jest.fn().mockResolvedValue({ id: 'rep1' }),
      ...(overrides?.repairs ?? {}),
    };
    const prisma = {
      reconciliationRun: {
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'run1',
          kind: ReconciliationRunKind.INTERNAL,
          status: ReconciliationRunStatus.COMPLETED,
          windowKey: 'internal:2026-08-20',
          cutoffAt: new Date(),
          recordsChecked: 1,
          findingsOpen: 0,
          errorSummary: null,
          startedAt: new Date(),
          finishedAt: new Date(),
          cursor: null,
          createdAt: new Date(),
          _count: { findings: 0, repairs: 0 },
        }),
      },
      reconciliationFinding: {
        findMany: jest.fn().mockResolvedValue([]),
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          id: 'f1',
          runId: 'run1',
          domain: 'CAMPAIGN',
          outcome: 'MISMATCH',
          severity: 'CRITICAL',
          status: ReconciliationFindingStatus.OPEN,
          fingerprint: 'fp',
          leftLabel: 'left',
          leftValue: '1',
          rightLabel: 'right',
          rightValue: '2',
          currency: 'NGN',
          unit: null,
          sourceIds: { campaignId: 'c1' },
          evidence: { secret: 'nope' },
          incidentRef: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          repairs: [],
        }),
        update: jest.fn().mockImplementation(({ data }) =>
          Promise.resolve({
            id: 'f1',
            runId: 'run1',
            domain: 'CAMPAIGN',
            outcome: 'MISMATCH',
            severity: 'CRITICAL',
            status: data.status,
            fingerprint: 'fp',
            leftLabel: 'left',
            leftValue: '1',
            rightLabel: 'right',
            rightValue: '2',
            currency: 'NGN',
            unit: null,
            sourceIds: { campaignId: 'c1' },
            incidentRef: data.incidentRef ?? null,
            createdAt: new Date(),
            updatedAt: new Date(),
          }),
        ),
      },
      ...(overrides?.prisma ?? {}),
    };
    const controller = new AdminReconciliationController(
      prisma as never,
      runs as never,
      repairs as never,
      audit as never,
    );
    return { controller, prisma, runs, repairs, audit };
  }

  it('returns paginated masked findings without evidence', async () => {
    const { controller, prisma } = build({
      prisma: {
        reconciliationFinding: {
          findMany: jest.fn().mockResolvedValue([
            {
              id: 'f1',
              runId: 'r1',
              domain: 'CAMPAIGN',
              outcome: 'MISMATCH',
              severity: 'CRITICAL',
              status: ReconciliationFindingStatus.OPEN,
              fingerprint: 'fp',
              leftLabel: 'left',
              leftValue: '1',
              rightLabel: 'right',
              rightValue: '2',
              currency: 'NGN',
              unit: null,
              sourceIds: { campaignId: 'c1', email: 'leak@example.com' },
              evidence: { rawSecret: 'sk_live' },
              incidentRef: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          ]),
        },
      },
    });

    const listed = await controller.listFindings(
      ReconciliationFindingStatus.OPEN,
      undefined,
      undefined,
      undefined,
      '50',
    );
    expect(listed.items).toHaveLength(1);
    expect(listed.items[0]).not.toHaveProperty('evidence');
    expect(listed.items[0].sourceIds).toEqual({ campaignId: 'c1' });
    expect(JSON.stringify(listed)).not.toContain('sk_live');
    expect(JSON.stringify(listed)).not.toContain('leak@example.com');
    expect(prisma.reconciliationFinding.findMany).toHaveBeenCalled();
  });

  it('lists runs with nextCursor', async () => {
    const rows = Array.from({ length: 3 }, (_, i) => ({
      id: `r${i}`,
      kind: 'INTERNAL',
      status: 'COMPLETED',
      windowKey: `internal:2026-08-0${i}`,
      cutoffAt: new Date(),
      recordsChecked: 1,
      findingsOpen: 0,
      errorSummary: null,
      startedAt: new Date(),
      finishedAt: new Date(),
      createdAt: new Date(),
    }));
    const { controller } = build({
      prisma: {
        reconciliationRun: {
          findMany: jest.fn().mockResolvedValue(rows),
        },
      },
    });
    const listed = await controller.listRuns(
      undefined,
      undefined,
      undefined,
      '2',
    );
    expect(listed.items).toHaveLength(2);
    expect(listed.nextCursor).toBe('r1');
  });

  it('gets run detail and triggers audited runs', async () => {
    const { controller, runs, audit, prisma } = build();
    await controller.getRun('run1');
    expect(prisma.reconciliationRun.findUniqueOrThrow).toHaveBeenCalled();

    await controller.triggerInternal({ id: 'admin1' } as never);
    expect(runs.runInternal).toHaveBeenCalled();
    expect(audit.log).toHaveBeenCalled();

    await controller.triggerProvider({ id: 'admin1' } as never, {
      forceIncomplete: true,
    });
    expect(runs.runProvider).toHaveBeenCalledWith(expect.any(Date), {
      forceIncomplete: true,
    });
  });

  it('exports csv without evidence columns', async () => {
    const { controller } = build({
      prisma: {
        reconciliationFinding: {
          findMany: jest
            .fn()
            .mockResolvedValueOnce([
              {
                id: 'f1',
                domain: 'PAYMENT',
                outcome: 'MISMATCH',
                severity: 'CRITICAL',
                status: 'OPEN',
                fingerprint: 'fp',
                leftLabel: '=cmd',
                leftValue: '1',
                rightLabel: 'right',
                rightValue: '2',
                currency: 'NGN',
              },
            ])
            .mockResolvedValueOnce([]),
        },
      },
    });
    const file = await controller.exportFindings(
      ReconciliationFindingStatus.OPEN,
    );
    expect(file).toBeInstanceOf(StreamableFile);
  });

  it('gets masked finding detail and acknowledges', async () => {
    const { controller, audit } = build();
    const detail = await controller.getFinding('f1');
    expect(detail).not.toHaveProperty('evidence');
    expect(detail.sourceIds).toEqual({ campaignId: 'c1' });

    const ack = await controller.acknowledge('f1', { id: 'admin1' } as never, {
      incidentRef: 'INC-1',
    });
    expect(ack.status).toBe(ReconciliationFindingStatus.ACKNOWLEDGED);
    expect(audit.log).toHaveBeenCalled();
  });

  it('requests and approves repairs', async () => {
    const { controller, repairs } = build();
    await controller.requestRepair('f1', { id: 'admin1' } as never, {
      commandKey: 'campaign.recompute_current_amount',
    });
    expect(repairs.requestRepair).toHaveBeenCalled();

    await controller.approveRepair('rep1', { id: 'admin2' } as never);
    expect(repairs.approveAndApply).toHaveBeenCalledWith({
      repairId: 'rep1',
      actorUserId: 'admin2',
    });
  });
});
