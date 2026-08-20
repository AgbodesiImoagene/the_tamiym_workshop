import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { ReconciliationRepairService } from './reconciliation-repair.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReconciliationRunsService } from './reconciliation-runs.service';
import {
  ReconciliationDomain,
  ReconciliationFindingStatus,
  ReconciliationRepairStatus,
} from '../generated/prisma/enums';

describe('ReconciliationRepairService', () => {
  let service: ReconciliationRepairService;
  let prisma: {
    reconciliationFinding: { findUnique: jest.Mock; update: jest.Mock };
    reconciliationRepairRequest: {
      create: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
    };
    campaignBalanceLedgerEntry: { aggregate: jest.Mock };
    campaign: { update: jest.Mock; findUniqueOrThrow: jest.Mock };
  };
  let runs: { runTargeted: jest.Mock };

  beforeEach(async () => {
    prisma = {
      reconciliationFinding: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'f1',
          runId: 'r1',
          domain: ReconciliationDomain.CAMPAIGN,
          status: ReconciliationFindingStatus.OPEN,
          leftValue: '10',
          rightValue: '12',
          sourceIds: { campaignId: 'c1' },
          fingerprint: 'fp1',
        }),
        update: jest.fn().mockResolvedValue({}),
      },
      reconciliationRepairRequest: {
        create: jest.fn().mockResolvedValue({ id: 'rep1' }),
        findUnique: jest.fn(),
        update: jest.fn().mockResolvedValue({ id: 'rep1' }),
      },
      campaignBalanceLedgerEntry: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { amount: 12 } }),
      },
      campaign: {
        update: jest.fn().mockResolvedValue({}),
        findUniqueOrThrow: jest
          .fn()
          .mockResolvedValue({ id: 'c1', currentAmount: 12 }),
      },
    };
    runs = {
      runTargeted: jest.fn().mockResolvedValue({ status: 'COMPLETED' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReconciliationRepairService,
        { provide: PrismaService, useValue: prisma },
        { provide: AuditService, useValue: { log: jest.fn() } },
        { provide: ReconciliationRunsService, useValue: runs },
      ],
    }).compile();

    service = module.get(ReconciliationRepairService);
  });

  it('rejects self-approval', async () => {
    prisma.reconciliationRepairRequest.findUnique.mockResolvedValue({
      id: 'rep1',
      status: ReconciliationRepairStatus.REQUESTED,
      requestedByUserId: 'admin-a',
      domain: ReconciliationDomain.CAMPAIGN,
      commandKey: 'campaign.recompute_current_amount',
      findingId: 'f1',
      finding: {
        id: 'f1',
        domain: ReconciliationDomain.CAMPAIGN,
        outcome: 'MISMATCH',
        rightLabel: 'ledger PAYMENT_SETTLED+REFUND_APPLIED',
        sourceIds: { campaignId: 'c1' },
        leftValue: '10',
        rightValue: '12',
        fingerprint: 'fp1',
      },
    });

    await expect(
      service.approveAndApply({ repairId: 'rep1', actorUserId: 'admin-a' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('applies campaign recompute with second admin after verification', async () => {
    prisma.reconciliationRepairRequest.findUnique.mockResolvedValue({
      id: 'rep1',
      status: ReconciliationRepairStatus.REQUESTED,
      requestedByUserId: 'admin-a',
      domain: ReconciliationDomain.CAMPAIGN,
      commandKey: 'campaign.recompute_current_amount',
      findingId: 'f1',
      finding: {
        id: 'f1',
        domain: ReconciliationDomain.CAMPAIGN,
        outcome: 'MISMATCH',
        rightLabel: 'ledger PAYMENT_SETTLED+REFUND_APPLIED',
        sourceIds: { campaignId: 'c1' },
        leftValue: '10',
        rightValue: '12',
        fingerprint: 'fp1',
      },
    });

    await service.approveAndApply({
      repairId: 'rep1',
      actorUserId: 'admin-b',
    });

    expect(prisma.campaign.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { currentAmount: 12 },
    });
    expect(runs.runTargeted).toHaveBeenCalledWith('f1');
    expect(prisma.reconciliationFinding.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'f1' },
        data: expect.objectContaining({
          status: ReconciliationFindingStatus.RESOLVED,
        }),
      }),
    );
  });

  it('rejects command/domain mismatch', async () => {
    prisma.reconciliationRepairRequest.findUnique.mockResolvedValue({
      id: 'rep1',
      status: ReconciliationRepairStatus.REQUESTED,
      requestedByUserId: 'admin-a',
      domain: ReconciliationDomain.PAYMENT,
      commandKey: 'campaign.recompute_current_amount',
      findingId: 'f1',
      finding: {
        id: 'f1',
        domain: ReconciliationDomain.PAYMENT,
        outcome: 'MISSING_INTERNAL',
        rightLabel: 'chargeSettlementClaim',
        sourceIds: { paymentId: 'pay1' },
        leftValue: 'x',
        rightValue: 'y',
        fingerprint: 'fp1',
      },
    });

    await expect(
      service.approveAndApply({ repairId: 'rep1', actorUserId: 'admin-b' }),
    ).rejects.toThrow(/not allowed for domain/i);
  });

  it('rejects payment document command on order mismatch finding', async () => {
    prisma.reconciliationRepairRequest.findUnique.mockResolvedValue({
      id: 'rep1',
      status: ReconciliationRepairStatus.REQUESTED,
      requestedByUserId: 'admin-a',
      domain: ReconciliationDomain.PAYMENT,
      commandKey: 'payment.document_missing_claim',
      findingId: 'f1',
      finding: {
        id: 'f1',
        domain: ReconciliationDomain.PAYMENT,
        outcome: 'MISMATCH',
        rightLabel: 'order.status/paymentStatus',
        sourceIds: { paymentId: 'pay1' },
        leftValue: 'SUCCEEDED',
        rightValue: 'DRAFT/PENDING',
        fingerprint: 'fp1',
      },
    });

    await expect(
      service.approveAndApply({ repairId: 'rep1', actorUserId: 'admin-b' }),
    ).rejects.toThrow(/not allowed for outcome/i);
  });

  it('marks WONT_FIX for payment.document_missing_claim', async () => {
    prisma.reconciliationRepairRequest.findUnique.mockResolvedValue({
      id: 'rep1',
      status: ReconciliationRepairStatus.REQUESTED,
      requestedByUserId: 'admin-a',
      domain: ReconciliationDomain.PAYMENT,
      commandKey: 'payment.document_missing_claim',
      findingId: 'f1',
      finding: {
        id: 'f1',
        domain: ReconciliationDomain.PAYMENT,
        outcome: 'MISSING_INTERNAL',
        rightLabel: 'chargeSettlementClaim',
        sourceIds: { paymentId: 'pay1' },
        leftValue: 'SUCCEEDED',
        rightValue: 'missing',
        fingerprint: 'fp1',
      },
    });

    await service.approveAndApply({
      repairId: 'rep1',
      actorUserId: 'admin-b',
    });

    expect(prisma.reconciliationFinding.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: ReconciliationFindingStatus.WONT_FIX,
        }),
      }),
    );
  });

  it.each([
    [
      'refund.document_missing_claim',
      ReconciliationDomain.REFUND,
      'MISSING_INTERNAL',
      'refundSettlementClaim',
    ],
    [
      'payout.document_ledger_gap',
      ReconciliationDomain.PAYOUT,
      'MISMATCH',
      'ledgerNet',
    ],
    [
      'inventory.noop_document_drift',
      ReconciliationDomain.INVENTORY,
      'MISMATCH',
      'sum(movement.reservedDelta)',
    ],
  ] as const)(
    'marks WONT_FIX for %s',
    async (commandKey, domain, outcome, rightLabel) => {
      prisma.reconciliationRepairRequest.findUnique.mockResolvedValue({
        id: 'rep1',
        status: ReconciliationRepairStatus.REQUESTED,
        requestedByUserId: 'admin-a',
        domain,
        commandKey,
        findingId: 'f1',
        finding: {
          id: 'f1',
          domain,
          outcome,
          rightLabel,
          sourceIds: { refundId: 'r1', payoutId: 'p1', variantId: 'v1' },
          leftValue: 'x',
          rightValue: 'y',
          fingerprint: 'fp1',
        },
      });

      await service.approveAndApply({
        repairId: 'rep1',
        actorUserId: 'admin-b',
      });

      expect(prisma.reconciliationFinding.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ReconciliationFindingStatus.WONT_FIX,
          }),
        }),
      );
    },
  );

  it('requestRepair creates repair for open finding', async () => {
    prisma.reconciliationFinding.findUnique.mockResolvedValue({
      id: 'f1',
      runId: 'r1',
      domain: ReconciliationDomain.CAMPAIGN,
      status: ReconciliationFindingStatus.OPEN,
      outcome: 'MISMATCH',
      rightLabel: 'ledger PAYMENT_SETTLED+REFUND_APPLIED',
      leftValue: '10',
      rightValue: '12',
      sourceIds: { campaignId: 'c1' },
    });
    prisma.reconciliationRepairRequest.create.mockResolvedValue({
      id: 'rep-new',
    });

    const repair = await service.requestRepair({
      findingId: 'f1',
      actorUserId: 'admin-a',
      commandKey: 'campaign.recompute_current_amount',
      payload: { note: 'fix' },
    });
    expect(repair.id).toBe('rep-new');
    expect(prisma.reconciliationRepairRequest.create).toHaveBeenCalled();
  });

  it('requestRepair rejects unknown finding', async () => {
    prisma.reconciliationFinding.findUnique.mockResolvedValue(null);
    await expect(
      service.requestRepair({
        findingId: 'missing',
        actorUserId: 'a',
        commandKey: 'campaign.recompute_current_amount',
      }),
    ).rejects.toThrow(/not found/i);
  });

  it('requestRepair rejects non-open finding', async () => {
    prisma.reconciliationFinding.findUnique.mockResolvedValue({
      id: 'f1',
      status: ReconciliationFindingStatus.RESOLVED,
      domain: ReconciliationDomain.CAMPAIGN,
    });
    await expect(
      service.requestRepair({
        findingId: 'f1',
        actorUserId: 'a',
        commandKey: 'campaign.recompute_current_amount',
      }),
    ).rejects.toThrow(/not repairable/i);
  });

  it('requestRepair rejects unknown command', async () => {
    prisma.reconciliationFinding.findUnique.mockResolvedValue({
      id: 'f1',
      status: ReconciliationFindingStatus.OPEN,
      domain: ReconciliationDomain.CAMPAIGN,
      outcome: 'MISMATCH',
    });
    await expect(
      service.requestRepair({
        findingId: 'f1',
        actorUserId: 'a',
        commandKey: 'not.a.command',
      }),
    ).rejects.toThrow(/Unknown repair command/i);
  });
});
