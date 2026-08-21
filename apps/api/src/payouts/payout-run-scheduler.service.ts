import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import type { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { PayoutRunsService } from './payout-runs.service';
import { PayoutMode } from '../generated/prisma/enums';
import { PAYOUT_QUEUE_NAME, JOB_EXECUTE_PAYOUT_RUN } from '../constants';
import { ObservabilityService } from '../observability/observability.service';
import { runWithRequestContext } from '../request-context/request-context.store';
import {
  isPayoutAutoExecuteEnabled,
  resolveSchedulerPayoutMode,
} from './payout-eligibility';

/**
 * Cron: create due payout runs from site policy.
 * When mode is AUTO_EXECUTE **and** PAYOUT_AUTO_EXECUTE_ENABLED, also approves
 * the run and queues it for execution (TTW-042).
 */
@Injectable()
export class PayoutRunSchedulerService {
  private readonly logger = new Logger(PayoutRunSchedulerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly payoutRunsService: PayoutRunsService,
    private readonly observability: ObservabilityService,
    private readonly config: ConfigService,
    @InjectQueue(PAYOUT_QUEUE_NAME) private readonly payoutQueue: Queue,
  ) {}

  /**
   * Run daily at 02:00 UTC. Create payout runs when cadence matches and mode is not MANUAL.
   */
  @Cron('0 2 * * *')
  async scheduleDuePayoutRuns() {
    const now = new Date();
    return runWithRequestContext(
      {
        requestId: `cron:payout-run:${now.toISOString()}`,
        source: 'CRON',
      },
      () =>
        this.observability.startSpan(
          'cron.payout_runs.schedule',
          {},
          async () => {
            const site = await this.prisma.siteSettings.findUnique({
              where: { id: 'default' },
            });
            if (!site || site.payoutMode === PayoutMode.MANUAL) {
              return;
            }

            const autoExecuteEnabled = isPayoutAutoExecuteEnabled(
              this.config.get<string>('PAYOUT_AUTO_EXECUTE_ENABLED'),
            );
            const runMode = resolveSchedulerPayoutMode(
              site.payoutMode,
              autoExecuteEnabled,
            ) as PayoutMode;
            if (
              site.payoutMode === PayoutMode.AUTO_EXECUTE &&
              runMode !== PayoutMode.AUTO_EXECUTE
            ) {
              this.logger.warn(
                'Site payoutMode is AUTO_EXECUTE but PAYOUT_AUTO_EXECUTE_ENABLED is off; scheduling as AUTO_APPROVAL_REQUIRED',
              );
            }

            const cadenceDays = site.payoutCadenceDays ?? 7;
            const cutoffAt = new Date(now);
            cutoffAt.setDate(cutoffAt.getDate() - cadenceDays);
            const scheduledFor = new Date(now);

            const preview =
              await this.payoutRunsService.previewPayoutRun(cutoffAt);
            if (preview.items.length === 0) {
              this.logger.debug('No eligible campaigns for payout run');
              return;
            }

            try {
              const systemUserId = await this.getSystemUserId();
              const { id, payoutCount } =
                await this.payoutRunsService.createPayoutRun(
                  scheduledFor,
                  cutoffAt,
                  runMode,
                  systemUserId,
                );
              this.logger.log(
                `Created payout run ${id} (${payoutCount} payouts)`,
              );

              if (runMode === PayoutMode.AUTO_EXECUTE && autoExecuteEnabled) {
                await this.payoutRunsService.approvePayoutRun(id, systemUserId);
                await this.payoutQueue.add(
                  JOB_EXECUTE_PAYOUT_RUN,
                  { runId: id },
                  {
                    attempts: 3,
                    backoff: { type: 'exponential', delay: 60_000 },
                  },
                );
                this.observability.recordQueueJob({
                  queue: PAYOUT_QUEUE_NAME,
                  jobName: JOB_EXECUTE_PAYOUT_RUN,
                  outcome: 'success',
                  durationMs: 0,
                });
                this.logger.log(`Queued payout run ${id} for execution`);
              }
            } catch (err) {
              this.logger.error(
                `Payout run scheduling failed: ${err instanceof Error ? err.message : String(err)}`,
              );
              throw err;
            }
          },
        ),
    );
  }

  private async getSystemUserId(): Promise<string> {
    const admin = await this.prisma.user.findFirst({
      where: { role: 'ADMIN' },
      select: { id: true },
    });
    if (admin) return admin.id;
    const anyUser = await this.prisma.user.findFirst({ select: { id: true } });
    if (anyUser) return anyUser.id;
    throw new Error('No user found for system-initiated payout run');
  }
}
