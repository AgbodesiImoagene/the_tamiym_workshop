import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  StreamableFile,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt/jwt.guard';
import { RolesGuard } from '../auth/guards/roles/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { RequestUser } from '../auth/strategies/jwt.strategy';
import {
  ReconciliationFindingStatus,
  ReconciliationRunKind,
  ReconciliationRunStatus,
  ReconciliationSeverity,
  UserRole,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationRunsService } from '../reconciliation/reconciliation-runs.service';
import { ReconciliationRepairService } from '../reconciliation/reconciliation-repair.service';
import { escapeCsvCell } from '../reconciliation/reconciliation.util';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditSource } from '../generated/prisma/enums';

/** Safe projection: entity ids only, no raw provider payloads or PII. */
function maskFinding<
  T extends {
    id: string;
    runId: string;
    domain: string;
    outcome: string;
    severity: string;
    status: string;
    fingerprint: string;
    leftLabel: string;
    leftValue: string;
    rightLabel: string;
    rightValue: string;
    currency: string | null;
    unit: string | null;
    sourceIds: unknown;
    incidentRef: string | null;
    createdAt: Date;
    updatedAt: Date;
  },
>(row: T) {
  const sourceIds =
    row.sourceIds && typeof row.sourceIds === 'object'
      ? Object.fromEntries(
          Object.entries(row.sourceIds as Record<string, unknown>)
            .filter(([k]) => /Id$/i.test(k) || k === 'variantId')
            .map(([k, v]) => [k, typeof v === 'string' ? v : null]),
        )
      : null;
  return {
    id: row.id,
    runId: row.runId,
    domain: row.domain,
    outcome: row.outcome,
    severity: row.severity,
    status: row.status,
    fingerprint: row.fingerprint,
    leftLabel: row.leftLabel,
    leftValue: row.leftValue,
    rightLabel: row.rightLabel,
    rightValue: row.rightValue,
    currency: row.currency,
    unit: row.unit,
    sourceIds,
    incidentRef: row.incidentRef,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@ApiTags('Admin')
@ApiBearerAuth()
@Controller('admin/reconciliation')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminReconciliationController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly runs: ReconciliationRunsService,
    private readonly repairs: ReconciliationRepairService,
    private readonly audit: AuditService,
  ) {}

  @Get('runs')
  @ApiOperation({ summary: 'List reconciliation runs (TTW-015)' })
  async listRuns(
    @Query('kind') kind?: ReconciliationRunKind,
    @Query('status') status?: ReconciliationRunStatus,
  ) {
    const rows = await this.prisma.reconciliationRun.findMany({
      where: {
        ...(kind ? { kind } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: 100,
      select: {
        id: true,
        kind: true,
        status: true,
        windowKey: true,
        cutoffAt: true,
        recordsChecked: true,
        findingsOpen: true,
        errorSummary: true,
        startedAt: true,
        finishedAt: true,
        createdAt: true,
      },
    });
    return rows;
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Get reconciliation run detail' })
  async getRun(@Param('id') id: string) {
    return this.prisma.reconciliationRun.findUniqueOrThrow({
      where: { id },
      select: {
        id: true,
        kind: true,
        status: true,
        windowKey: true,
        cutoffAt: true,
        recordsChecked: true,
        findingsOpen: true,
        errorSummary: true,
        startedAt: true,
        finishedAt: true,
        cursor: true,
        createdAt: true,
        _count: { select: { findings: true, repairs: true } },
      },
    });
  }

  @Post('runs/internal')
  @ApiOperation({ summary: 'Trigger an internal reconciliation run now' })
  async triggerInternal(@CurrentUser() user: RequestUser) {
    const run = await this.runs.runInternal(new Date());
    await this.audit.log({
      eventName: 'admin.reconciliation.run.internal',
      action: AuditAction.CREATE,
      entityType: 'ReconciliationRun',
      entityId: run?.id ?? 'skipped',
      actorUserId: user.id,
      source: AuditSource.ADMIN_API,
      after: { status: run?.status ?? 'LOCK_HELD' },
    });
    return run;
  }

  @Post('runs/provider')
  @ApiOperation({ summary: 'Trigger a provider reconciliation run now' })
  async triggerProvider(
    @CurrentUser() user: RequestUser,
    @Body() body?: { forceIncomplete?: boolean },
  ) {
    const run = await this.runs.runProvider(new Date(), {
      forceIncomplete: body?.forceIncomplete === true,
    });
    await this.audit.log({
      eventName: 'admin.reconciliation.run.provider',
      action: AuditAction.CREATE,
      entityType: 'ReconciliationRun',
      entityId: run?.id ?? 'skipped',
      actorUserId: user.id,
      source: AuditSource.ADMIN_API,
      after: { status: run?.status ?? 'LOCK_HELD' },
    });
    return run;
  }

  @Get('findings')
  @ApiOperation({ summary: 'List reconciliation findings (masked)' })
  async listFindings(
    @Query('status') status?: ReconciliationFindingStatus,
    @Query('runId') runId?: string,
    @Query('severity') severity?: ReconciliationSeverity,
  ) {
    const rows = await this.prisma.reconciliationFinding.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(runId ? { runId } : {}),
        ...(severity ? { severity } : {}),
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map(maskFinding);
  }

  @Get('findings/export')
  @ApiOperation({ summary: 'CSV export of findings (formula-injection safe)' })
  async exportFindings(
    @Query('status') status?: ReconciliationFindingStatus,
  ): Promise<StreamableFile> {
    const rows = await this.prisma.reconciliationFinding.findMany({
      where: status ? { status } : undefined,
      orderBy: { createdAt: 'desc' },
      take: 1000,
    });
    const header = [
      'id',
      'domain',
      'outcome',
      'severity',
      'status',
      'fingerprint',
      'leftLabel',
      'leftValue',
      'rightLabel',
      'rightValue',
      'currency',
    ];
    const lines = [
      header.join(','),
      ...rows.map((r) =>
        [
          r.id,
          r.domain,
          r.outcome,
          r.severity,
          r.status,
          r.fingerprint,
          r.leftLabel,
          r.leftValue,
          r.rightLabel,
          r.rightValue,
          r.currency ?? '',
        ]
          .map((c) => escapeCsvCell(String(c)))
          .join(','),
      ),
    ];
    const buf = Buffer.from(lines.join('\n'), 'utf8');
    return new StreamableFile(buf, {
      type: 'text/csv; charset=utf-8',
      disposition: 'attachment; filename="reconciliation-findings.csv"',
    });
  }

  @Get('findings/:id')
  @ApiOperation({ summary: 'Finding detail with masked evidence' })
  async getFinding(@Param('id') id: string) {
    const row = await this.prisma.reconciliationFinding.findUniqueOrThrow({
      where: { id },
      include: {
        repairs: {
          select: {
            id: true,
            status: true,
            commandKey: true,
            requestedByUserId: true,
            approvedByUserId: true,
            createdAt: true,
            updatedAt: true,
            errorSummary: true,
          },
        },
      },
    });
    return { ...maskFinding(row), repairs: row.repairs };
  }

  @Post('findings/:id/acknowledge')
  @ApiOperation({ summary: 'Acknowledge a finding (single admin)' })
  async acknowledge(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body?: { incidentRef?: string },
  ) {
    const updated = await this.prisma.reconciliationFinding.update({
      where: { id },
      data: {
        status: ReconciliationFindingStatus.ACKNOWLEDGED,
        acknowledgedByUserId: user.id,
        acknowledgedAt: new Date(),
        incidentRef: body?.incidentRef,
      },
    });
    await this.audit.log({
      eventName: 'admin.reconciliation.finding.acknowledged',
      action: AuditAction.STATUS_CHANGE,
      entityType: 'ReconciliationFinding',
      entityId: id,
      actorUserId: user.id,
      source: AuditSource.ADMIN_API,
      after: { incidentRef: body?.incidentRef },
    });
    return maskFinding(updated);
  }

  @Post('findings/:id/repair-request')
  @ApiOperation({ summary: 'Request a two-person repair for a finding' })
  async requestRepair(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
    @Body() body: { commandKey: string; payload?: Record<string, unknown> },
  ) {
    return this.repairs.requestRepair({
      findingId: id,
      actorUserId: user.id,
      commandKey: body.commandKey,
      payload: body.payload,
    });
  }

  @Post('repairs/:id/approve')
  @ApiOperation({
    summary: 'Second admin approves and applies a repair (≠ requester)',
  })
  async approveRepair(
    @Param('id') id: string,
    @CurrentUser() user: RequestUser,
  ) {
    return this.repairs.approveAndApply({
      repairId: id,
      actorUserId: user.id,
    });
  }
}
