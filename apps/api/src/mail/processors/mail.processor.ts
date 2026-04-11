import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  MAIL_QUEUE_NAME,
  JOB_VERIFICATION_EMAIL,
  JOB_PASSWORD_RESET_EMAIL,
  JOB_NOTIFICATION_OUTBOX,
} from '../../constants';
import {
  MailService,
  SendVerificationEmailPayload,
  SendPasswordResetEmailPayload,
} from '../mail.service';
import { ObservabilityService } from '../../observability/observability.service';
import { runWithRequestContext } from '../../request-context/request-context.store';
import { NotificationOutboxDeliveryService } from '../notification-outbox-delivery.service';

export interface NotificationOutboxJobData {
  outboxId: string;
}

@Processor(MAIL_QUEUE_NAME)
export class MailProcessor extends WorkerHost {
  private readonly logger = new Logger(MailProcessor.name);

  constructor(
    private readonly mailService: MailService,
    private readonly observability: ObservabilityService,
    private readonly notificationOutboxDelivery: NotificationOutboxDeliveryService,
  ) {
    super();
  }

  async process(
    job: Job<
      | SendVerificationEmailPayload
      | SendPasswordResetEmailPayload
      | NotificationOutboxJobData,
      void,
      string
    >,
  ): Promise<void> {
    const startedAt = process.hrtime.bigint();
    return runWithRequestContext(
      {
        requestId: `worker:${MAIL_QUEUE_NAME}:${job.id ?? job.name}`,
        source: 'WORKER',
      },
      async () => {
        try {
          switch (job.name) {
            case JOB_VERIFICATION_EMAIL:
              await this.mailService.sendVerificationEmail(
                job.data as SendVerificationEmailPayload,
              );
              this.logger.log(
                `Sent verification email to ${(job.data as SendVerificationEmailPayload).to}`,
              );
              break;
            case JOB_PASSWORD_RESET_EMAIL:
              await this.mailService.sendPasswordResetEmail(
                job.data as SendPasswordResetEmailPayload,
              );
              this.logger.log(
                `Sent password reset email to ${(job.data as SendPasswordResetEmailPayload).to}`,
              );
              break;
            case JOB_NOTIFICATION_OUTBOX:
              await this.notificationOutboxDelivery.deliverOutbox(
                (job.data as NotificationOutboxJobData).outboxId,
              );
              this.logger.log(
                `Processed notification outbox ${(job.data as NotificationOutboxJobData).outboxId}`,
              );
              break;
            default:
              throw new Error(`Unknown mail job name: ${job.name}`);
          }
          this.observability.recordQueueJob({
            queue: MAIL_QUEUE_NAME,
            jobName: job.name,
            outcome: 'success',
            durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
          });
        } catch (error) {
          this.observability.recordQueueJob({
            queue: MAIL_QUEUE_NAME,
            jobName: job.name,
            outcome: 'failure',
            durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
          });
          throw error;
        }
      },
    );
  }
}
