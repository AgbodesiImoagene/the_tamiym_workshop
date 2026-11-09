import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import {
  MAIL_QUEUE_NAME,
  AUTH_LINK_JOB_NAMES,
  JOB_VERIFICATION_EMAIL,
  JOB_PASSWORD_RESET_EMAIL,
  JOB_NOTIFICATION_OUTBOX,
  JOB_GOOGLE_LINKED_PASSWORD_REMOVED_EMAIL,
  JOB_GOOGLE_LINKED_ACCOUNT_SUSPENDED_EMAIL,
} from '../../constants';
import {
  MailService,
  SendVerificationEmailPayload,
  SendPasswordResetEmailPayload,
  SendGoogleLinkedPasswordRemovedEmailPayload,
  SendGoogleLinkedAccountSuspendedEmailPayload,
} from '../mail.service';
import { ObservabilityService } from '../../observability/observability.service';
import { runWithRequestContext } from '../../request-context/request-context.store';
import { NotificationOutboxDeliveryService } from '../notification-outbox-delivery.service';
import { bullProcessorOptions } from '../../queues/bull-processor.options';

export interface NotificationOutboxJobData {
  outboxId: string;
}

@Processor(MAIL_QUEUE_NAME, bullProcessorOptions)
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
      | SendGoogleLinkedPasswordRemovedEmailPayload
      | SendGoogleLinkedAccountSuspendedEmailPayload
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
              // No address in the log line (TTW-184, as TTW-179).
              this.logger.log(
                `Sent verification email (job ${job.id ?? 'unknown'})`,
              );
              break;
            case JOB_PASSWORD_RESET_EMAIL:
              await this.mailService.sendPasswordResetEmail(
                job.data as SendPasswordResetEmailPayload,
              );
              this.logger.log(
                `Sent password reset email (job ${job.id ?? 'unknown'})`,
              );
              break;
            case JOB_GOOGLE_LINKED_PASSWORD_REMOVED_EMAIL:
              await this.mailService.sendGoogleLinkedPasswordRemovedEmail(
                job.data as SendGoogleLinkedPasswordRemovedEmailPayload,
              );
              // No address in the log line (TTW-179).
              this.logger.log(
                `Sent Google-linked password-removed notice (job ${job.id ?? 'unknown'})`,
              );
              break;
            case JOB_GOOGLE_LINKED_ACCOUNT_SUSPENDED_EMAIL:
              await this.mailService.sendGoogleLinkedAccountSuspendedEmail(
                job.data as SendGoogleLinkedAccountSuspendedEmailPayload,
              );
              // No address in the log line (TTW-179).
              this.logger.log(
                `Sent Google-linked account-suspended notice (job ${job.id ?? 'unknown'})`,
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
          this.warnIfAuthLinkJobGaveUp(job, error);
          throw error;
        }
      },
    );
  }

  /**
   * TTW-184: a reset or verification job is removed from Redis at its final
   * failure (`removeOnFail: true`), so this line is what operations see. It
   * names the job and the error's name/code only: the error message can carry
   * the address, and the job data carries the link.
   * Not covered: a job BullMQ fails without calling `process()` (stalled too
   * often) or an `UnrecoverableError` before the last attempt. Both are still
   * removed by `removeOnFail: true`; only this line is missing for them.
   */
  private warnIfAuthLinkJobGaveUp(job: Job, error: unknown): void {
    if (!AUTH_LINK_JOB_NAMES.has(job.name)) return;
    const attempts = job.opts?.attempts ?? 1;
    if (job.attemptsMade + 1 < attempts) return;
    const name = error instanceof Error ? error.name : typeof error;
    const code =
      typeof error === 'object' && error !== null && 'code' in error
        ? String((error as { code: unknown }).code)
        : 'none';
    this.logger.warn(
      `Gave up on ${job.name} (job ${job.id ?? 'unknown'}) after ${attempts} attempts (${name}, code ${code}); job removed from Redis`,
    );
  }
}
