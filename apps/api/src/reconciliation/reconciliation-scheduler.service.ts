import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ObservabilityService } from '../observability/observability.service';
import { runWithRequestContext } from '../request-context/request-context.store';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import { ADMIN_NOTIF_RECONCILIATION_RUN } from '../admin-notifications/admin-notification-events';
import { PrismaService } from '../prisma/prisma.service';
import {
  ReconciliationFindingStatus,
  ReconciliationSeverity,
} from '../generated/prisma/enums';
import { ReconciliationRunsService } from './reconciliation-runs.service';
import { lagosDayIso, windowKeyFor } from './reconciliation.util';

const RETENTION_DAYS = 400;

@Injectable()
export class ReconciliationSchedulerService {
  private readonly logger = new Logger(ReconciliationSchedulerService.name);

  constructor(
    private readonly runs: ReconciliationRunsService,
    private readonly observability: ObservabilityService,
    private readonly adminNotify: AdminNotifyService,
    private readonly prisma: PrismaService,
  ) {}

  /** Nightly internal reconciliation (Africa/Lagos 01:15). */
  @Cron('15 1 * * *', { timeZone: 'Africa/Lagos' })
  async runInternalNightly() {
    const now = new Date();
    return runWithRequestContext(
      {
        requestId: `cron:reconciliation-internal:${now.toISOString()}`,
        source: 'CRON',
      },
      () =>
        this.observability.startSpan(
          'cron.reconciliation.internal',
          {},
          async () => {
            const run = await this.runs.runInternal(now);
            if (!run) {
              this.logger.warn('Internal reconciliation skipped (lock held)');
              return;
            }
            this.logger.log(
              `Internal reconciliation ${run.id} status=${run.status} open=${run.findingsOpen}`,
            );
            if (
              run.findingsOpen > 0 ||
              run.status === 'INCOMPLETE' ||
              run.status === 'FAILED'
            ) {
              await this.adminNotify.emit(ADMIN_NOTIF_RECONCILIATION_RUN, {
                kind: run.kind,
                runId: run.id,
                status: run.status,
                findingsOpen: run.findingsOpen,
              });
            }
          },
        ),
    );
  }

  /** Daily provider reconciliation (Africa/Lagos 03:30). */
  @Cron('30 3 * * *', { timeZone: 'Africa/Lagos' })
  async runProviderDaily() {
    const now = new Date();
    return runWithRequestContext(
      {
        requestId: `cron:reconciliation-provider:${now.toISOString()}`,
        source: 'CRON',
      },
      () =>
        this.observability.startSpan(
          'cron.reconciliation.provider',
          {},
          async () => {
            const run = await this.runs.runProvider(now);
            if (!run) {
              this.logger.warn('Provider reconciliation skipped (lock held)');
              return;
            }
            this.logger.log(
              `Provider reconciliation ${run.id} status=${run.status} open=${run.findingsOpen}`,
            );
            if (
              run.status === 'INCOMPLETE' ||
              run.status === 'FAILED' ||
              run.findingsOpen > 0
            ) {
              await this.adminNotify.emit(ADMIN_NOTIF_RECONCILIATION_RUN, {
                kind: run.kind,
                runId: run.id,
                status: run.status,
                findingsOpen: run.findingsOpen,
              });
            }
          },
        ),
    );
  }

  /** Hourly: alert on missed windows and stale CRITICAL findings (ADR P0). */
  @Cron('5 * * * *', { timeZone: 'Africa/Lagos' })
  async monitorMissedAndStale() {
    const now = new Date();
    return runWithRequestContext(
      {
        requestId: `cron:reconciliation-monitor:${now.toISOString()}`,
        source: 'CRON',
      },
      async () => {
        const day = lagosDayIso(now);
        const lagosHour = (now.getUTCHours() + 1) % 24;

        if (lagosHour >= 2) {
          const internalKey = windowKeyFor('internal', day);
          const internal = await this.prisma.reconciliationRun.findUnique({
            where: {
              kind_windowKey: { kind: 'INTERNAL', windowKey: internalKey },
            },
          });
          if (!internal) {
            await this.adminNotify.emit(ADMIN_NOTIF_RECONCILIATION_RUN, {
              kind: 'INTERNAL',
              runId: 'missing',
              status: 'MISSED_SCHEDULE',
              findingsOpen: 0,
              windowKey: internalKey,
            });
          }
        }

        if (lagosHour >= 4) {
          const providerKey = windowKeyFor('provider', day);
          const provider = await this.prisma.reconciliationRun.findUnique({
            where: {
              kind_windowKey: { kind: 'PROVIDER', windowKey: providerKey },
            },
          });
          if (!provider) {
            await this.adminNotify.emit(ADMIN_NOTIF_RECONCILIATION_RUN, {
              kind: 'PROVIDER',
              runId: 'missing',
              status: 'MISSED_SCHEDULE',
              findingsOpen: 0,
              windowKey: providerKey,
            });
          }
        }

        const staleBefore = new Date(now.getTime() - 4 * 60 * 60 * 1000);
        const staleCritical = await this.prisma.reconciliationFinding.count({
          where: {
            severity: ReconciliationSeverity.CRITICAL,
            status: ReconciliationFindingStatus.OPEN,
            createdAt: { lte: staleBefore },
            acknowledgedAt: null,
          },
        });
        if (staleCritical > 0) {
          await this.adminNotify.emit(ADMIN_NOTIF_RECONCILIATION_RUN, {
            kind: 'MONITOR',
            runId: 'stale-critical',
            status: 'STALE_CRITICAL',
            findingsOpen: staleCritical,
          });
        }
      },
    );
  }

  /** Daily retention purge (ADR: 400 days). */
  @Cron('0 4 * * *', { timeZone: 'Africa/Lagos' })
  async purgeExpiredRuns() {
    const cutoff = new Date();
    cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);
    const deleted = await this.prisma.reconciliationRun.deleteMany({
      where: { createdAt: { lt: cutoff } },
    });
    if (deleted.count > 0) {
      this.logger.log(
        `Purged ${deleted.count} reconciliation runs older than ${RETENTION_DAYS} days`,
      );
    }
  }
}
