import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  AuditAction,
  AuditSource,
  ReconciliationDomain,
  ReconciliationFindingStatus,
  ReconciliationRepairStatus,
  ReconciliationRunStatus,
} from '../generated/prisma/enums';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { ReconciliationRunsService } from './reconciliation-runs.service';

const COMMAND_BY_DOMAIN: Record<ReconciliationDomain, readonly string[]> = {
  [ReconciliationDomain.PAYMENT]: ['payment.document_missing_claim'],
  [ReconciliationDomain.REFUND]: ['refund.document_missing_claim'],
  [ReconciliationDomain.PAYOUT]: ['payout.document_ledger_gap'],
  [ReconciliationDomain.CAMPAIGN]: ['campaign.recompute_current_amount'],
  [ReconciliationDomain.INVENTORY]: ['inventory.noop_document_drift'],
};

@Injectable()
export class ReconciliationRepairService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly runs: ReconciliationRunsService,
  ) {}

  async requestRepair(params: {
    findingId: string;
    actorUserId: string;
    commandKey: string;
    payload?: Record<string, unknown>;
  }) {
    const finding = await this.prisma.reconciliationFinding.findUnique({
      where: { id: params.findingId },
    });
    if (!finding) throw new NotFoundException('Finding not found');
    if (
      finding.status !== ReconciliationFindingStatus.OPEN &&
      finding.status !== ReconciliationFindingStatus.ACKNOWLEDGED
    ) {
      throw new BadRequestException(
        'Finding is not repairable in current status',
      );
    }
    this.assertCommandForDomain(finding.domain, params.commandKey);

    const repair = await this.prisma.reconciliationRepairRequest.create({
      data: {
        runId: finding.runId,
        findingId: finding.id,
        domain: finding.domain,
        commandKey: params.commandKey,
        payload: (params.payload ?? undefined) as
          | Prisma.InputJsonValue
          | undefined,
        requestedByUserId: params.actorUserId,
        beforeEvidence: {
          leftValue: finding.leftValue,
          rightValue: finding.rightValue,
          sourceIds: finding.sourceIds,
        } as Prisma.InputJsonValue,
      },
    });

    await this.audit.log({
      eventName: 'admin.reconciliation.repair.requested',
      action: AuditAction.CREATE,
      entityType: 'ReconciliationRepairRequest',
      entityId: repair.id,
      actorUserId: params.actorUserId,
      source: AuditSource.ADMIN_API,
      after: { commandKey: params.commandKey, findingId: finding.id },
    });

    return repair;
  }

  async approveAndApply(params: { repairId: string; actorUserId: string }) {
    const repair = await this.prisma.reconciliationRepairRequest.findUnique({
      where: { id: params.repairId },
      include: { finding: true },
    });
    if (!repair) throw new NotFoundException('Repair request not found');
    if (repair.status !== ReconciliationRepairStatus.REQUESTED) {
      throw new BadRequestException('Repair is not awaiting approval');
    }
    if (repair.requestedByUserId === params.actorUserId) {
      throw new ForbiddenException(
        'A second distinct admin must approve money/stock repairs',
      );
    }

    const moneyOrStock =
      repair.domain === ReconciliationDomain.PAYMENT ||
      repair.domain === ReconciliationDomain.REFUND ||
      repair.domain === ReconciliationDomain.PAYOUT ||
      repair.domain === ReconciliationDomain.CAMPAIGN ||
      repair.domain === ReconciliationDomain.INVENTORY;
    if (!moneyOrStock) {
      throw new BadRequestException('Unsupported repair domain');
    }
    this.assertCommandForDomain(repair.domain, repair.commandKey);

    await this.prisma.reconciliationRepairRequest.update({
      where: { id: repair.id },
      data: {
        status: ReconciliationRepairStatus.APPROVED,
        approvedByUserId: params.actorUserId,
      },
    });

    try {
      const after = await this.applyCommand(repair.commandKey, repair.finding);
      const isDocumentOnly =
        repair.commandKey.includes('document') ||
        repair.commandKey.includes('noop');

      await this.audit.log({
        eventName: 'admin.reconciliation.repair.applied',
        action: AuditAction.UPDATE,
        entityType: 'ReconciliationRepairRequest',
        entityId: repair.id,
        actorUserId: params.actorUserId,
        source: AuditSource.ADMIN_API,
        after,
      });

      const verifyRun = await this.runs.runTargeted(repair.findingId);
      if (
        !verifyRun ||
        verifyRun.status === ReconciliationRunStatus.FAILED ||
        verifyRun.status === ReconciliationRunStatus.INCOMPLETE
      ) {
        await this.prisma.reconciliationRepairRequest.update({
          where: { id: repair.id },
          data: {
            status: ReconciliationRepairStatus.FAILED,
            errorSummary: `Targeted verification run status=${verifyRun?.status ?? 'null'}`,
            afterEvidence: after as Prisma.InputJsonValue,
          },
        });
        throw new BadRequestException(
          'Repair verification failed: targeted run did not complete',
        );
      }

      if (isDocumentOnly) {
        await this.prisma.reconciliationFinding.update({
          where: { id: repair.findingId },
          data: {
            status: ReconciliationFindingStatus.WONT_FIX,
            resolvedByUserId: params.actorUserId,
            resolvedAt: new Date(),
          },
        });
      } else if (repair.commandKey === 'campaign.recompute_current_amount') {
        const sourceIds = (repair.finding.sourceIds ?? {}) as Record<
          string,
          string
        >;
        const campaignId = sourceIds.campaignId;
        if (!campaignId) {
          throw new BadRequestException('campaignId required for verification');
        }
        const campaign = await this.prisma.campaign.findUniqueOrThrow({
          where: { id: campaignId },
        });
        const ledger = await this.prisma.campaignBalanceLedgerEntry.aggregate({
          where: {
            campaignId,
            entryType: { in: ['PAYMENT_SETTLED', 'REFUND_APPLIED'] },
          },
          _sum: { amount: true },
        });
        const ok =
          Math.abs(
            Number(campaign.currentAmount) - Number(ledger._sum.amount ?? 0),
          ) <= 0.01;
        if (!ok) {
          await this.prisma.reconciliationRepairRequest.update({
            where: { id: repair.id },
            data: {
              status: ReconciliationRepairStatus.FAILED,
              errorSummary:
                'Targeted verification: currentAmount still mismatched',
              afterEvidence: after as Prisma.InputJsonValue,
            },
          });
          throw new BadRequestException(
            'Repair verification failed: campaign amount still mismatched',
          );
        }
        await this.prisma.reconciliationFinding.update({
          where: { id: repair.findingId },
          data: {
            status: ReconciliationFindingStatus.RESOLVED,
            resolvedByUserId: params.actorUserId,
            resolvedAt: new Date(),
          },
        });
      } else {
        await this.prisma.reconciliationFinding.update({
          where: { id: repair.findingId },
          data: {
            status: ReconciliationFindingStatus.RESOLVED,
            resolvedByUserId: params.actorUserId,
            resolvedAt: new Date(),
          },
        });
      }

      return this.prisma.reconciliationRepairRequest.update({
        where: { id: repair.id },
        data: {
          status: ReconciliationRepairStatus.APPLIED,
          afterEvidence: after as Prisma.InputJsonValue,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'repair failed';
      await this.prisma.reconciliationRepairRequest.update({
        where: { id: repair.id },
        data: {
          status: ReconciliationRepairStatus.FAILED,
          errorSummary: message.slice(0, 500),
        },
      });
      throw error;
    }
  }

  private assertCommandForDomain(
    domain: ReconciliationDomain,
    commandKey: string,
  ) {
    const allowed = COMMAND_BY_DOMAIN[domain] ?? [];
    if (!allowed.includes(commandKey)) {
      throw new BadRequestException(
        `Command ${commandKey} is not allowed for domain ${domain}`,
      );
    }
  }

  private async applyCommand(
    commandKey: string,
    finding: {
      domain: ReconciliationDomain;
      sourceIds: unknown;
      leftValue: string;
      rightValue: string;
    },
  ): Promise<Record<string, unknown>> {
    const sourceIds = (finding.sourceIds ?? {}) as Record<string, string>;

    if (commandKey === 'campaign.recompute_current_amount') {
      const campaignId = sourceIds.campaignId;
      if (!campaignId) throw new BadRequestException('campaignId required');
      const ledger = await this.prisma.campaignBalanceLedgerEntry.aggregate({
        where: {
          campaignId,
          entryType: { in: ['PAYMENT_SETTLED', 'REFUND_APPLIED'] },
        },
        _sum: { amount: true },
      });
      const next = Number(ledger._sum.amount ?? 0);
      await this.prisma.campaign.update({
        where: { id: campaignId },
        data: { currentAmount: next },
      });
      return { campaignId, currentAmount: next };
    }

    if (commandKey === 'inventory.noop_document_drift') {
      return {
        variantId: sourceIds.variantId ?? null,
        note: 'Documented inventory drift; no automatic counter rewrite',
      };
    }

    if (commandKey === 'payout.document_ledger_gap') {
      return {
        payoutId: sourceIds.payoutId ?? null,
        note: 'Documented payout/ledger gap; use payout retry/manual adjustment flows',
      };
    }

    if (commandKey === 'payment.document_missing_claim') {
      return {
        paymentId: sourceIds.paymentId ?? null,
        note: 'Documented missing settlement claim; do not invent a second claim',
      };
    }

    if (commandKey === 'refund.document_missing_claim') {
      return {
        refundId: sourceIds.refundId ?? null,
        note: 'Documented missing refund settlement claim',
      };
    }

    throw new BadRequestException(`Unknown repair command: ${commandKey}`);
  }
}
