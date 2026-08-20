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
  UserRole,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { ReconciliationRunsService } from '../reconciliation/reconciliation-runs.service';
import { ReconciliationRepairService } from '../reconciliation/reconciliation-repair.service';
import { escapeCsvCell } from '../reconciliation/reconciliation.util';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditSource } from '../generated/prisma/enums';

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
    return this.prisma.reconciliationRun.findMany({
      where: {
        ...(kind ? { kind } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { startedAt: 'desc' },
      take: 100,
    });
  }

  @Get('runs/:id')
  @ApiOperation({ summary: 'Get reconciliation run detail' })
  async getRun(@Param('id') id: string) {
    return this.prisma.reconciliationRun.findUniqueOrThrow({
      where: { id },
      include: {
        _count: { select: { findings: true, repairs: true } },
      },
    });
  }

  @Post('runs/internal')
  @ApiOperation({ summary: 'Trigger an internal reconciliation run now' })
  async triggerInternal() {
    return this.runs.runInternal(new Date());
  }

  @Post('runs/provider')
  @ApiOperation({ summary: 'Trigger a provider reconciliation run now' })
  async triggerProvider(@Body() body?: { forceIncomplete?: boolean }) {
    return this.runs.runProvider(new Date(), {
      forceIncomplete: body?.forceIncomplete === true,
    });
  }

  @Get('findings')
  @ApiOperation({ summary: 'List reconciliation findings' })
  async listFindings(
    @Query('status') status?: ReconciliationFindingStatus,
    @Query('runId') runId?: string,
    @Query('severity') severity?: string,
  ) {
    return this.prisma.reconciliationFinding.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(runId ? { runId } : {}),
        ...(severity ? { severity: severity as never } : {}),
      },
      orderBy: [{ severity: 'asc' }, { createdAt: 'desc' }],
      take: 200,
    });
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
    return this.prisma.reconciliationFinding.findUniqueOrThrow({
      where: { id },
      include: { repairs: true },
    });
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
    return updated;
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
