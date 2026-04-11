import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { PAYOUT_QUEUE_NAME, JOB_EXECUTE_PAYOUT_RUN } from '../constants';
import { PayoutRunsService } from './payout-runs.service';
import { ObservabilityService } from '../observability/observability.service';
import { runWithRequestContext } from '../request-context/request-context.store';

export interface ExecutePayoutRunPayload {
  runId: string;
}

@Processor(PAYOUT_QUEUE_NAME)
export class PayoutExecutionProcessor extends WorkerHost {
  private readonly logger = new Logger(PayoutExecutionProcessor.name);

  constructor(
    private readonly payoutRunsService: PayoutRunsService,
    private readonly observability: ObservabilityService,
  ) {
    super();
  }

  async process(
    job: Job<ExecutePayoutRunPayload, void, string>,
  ): Promise<void> {
    const startedAt = process.hrtime.bigint();
    return runWithRequestContext(
      {
        requestId: `worker:${PAYOUT_QUEUE_NAME}:${job.id ?? job.name}`,
        source: 'WORKER',
      },
      () =>
        this.observability.startSpan(
          'worker.payout_run.process',
          {
            'queue.name': PAYOUT_QUEUE_NAME,
            'job.name': job.name,
            'payout.run_id': job.data.runId,
          },
          async () => {
            try {
              if (job.name !== JOB_EXECUTE_PAYOUT_RUN) {
                this.logger.warn(`Unknown job name: ${job.name}`);
                return;
              }
              const { runId } = job.data;
              this.logger.log(`Executing payout run ${runId}`);
              const result =
                await this.payoutRunsService.executePayoutRun(runId);
              this.logger.log(
                `Payout run ${runId} ${result.status}, processed ${result.processed} payout(s)`,
              );
              this.observability.recordQueueJob({
                queue: PAYOUT_QUEUE_NAME,
                jobName: job.name,
                outcome: 'success',
                durationMs:
                  Number(process.hrtime.bigint() - startedAt) / 1_000_000,
              });
            } catch (error) {
              this.observability.recordQueueJob({
                queue: PAYOUT_QUEUE_NAME,
                jobName: job.name,
                outcome: 'failure',
                durationMs:
                  Number(process.hrtime.bigint() - startedAt) / 1_000_000,
              });
              throw error;
            }
          },
        ),
    );
  }
}
