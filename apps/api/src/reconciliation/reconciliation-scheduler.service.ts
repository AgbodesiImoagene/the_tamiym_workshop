import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { ObservabilityService } from '../observability/observability.service';
import { runWithRequestContext } from '../request-context/request-context.store';
import { AdminNotifyService } from '../admin-notifications/admin-notify.service';
import { ADMIN_NOTIF_RECONCILIATION_RUN } from '../admin-notifications/admin-notification-events';
import { ReconciliationRunsService } from './reconciliation-runs.service';

@Injectable()
export class ReconciliationSchedulerService {
  private readonly logger = new Logger(ReconciliationSchedulerService.name);

  constructor(
    private readonly runs: ReconciliationRunsService,
    private readonly observability: ObservabilityService,
    private readonly adminNotify: AdminNotifyService,
  ) {}

  /** Nightly internal reconciliation (Africa/Lagos ~01:15). */
  @Cron('15 1 * * *')
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
            if (!run) return;
            this.logger.log(
              `Internal reconciliation ${run.id} status=${run.status} open=${run.findingsOpen}`,
            );
            if (run.findingsOpen > 0 || run.status !== 'COMPLETED') {
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

  /** Daily provider reconciliation after reporting window (Africa/Lagos ~03:30). */
  @Cron('30 3 * * *')
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
            if (!run) return;
            this.logger.log(
              `Provider reconciliation ${run.id} status=${run.status} open=${run.findingsOpen}`,
            );
            if (run.status === 'INCOMPLETE' || run.findingsOpen > 0) {
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
}
