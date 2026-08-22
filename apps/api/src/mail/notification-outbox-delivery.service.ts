import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationAttemptOutcome,
  NotificationChannel,
  NotificationStatus,
  DeadLetterAckStatus,
} from '../generated/prisma/enums';
import { JOB_NOTIFICATION_OUTBOX, MAIL_QUEUE_NAME } from '../constants';
import { MailService } from './mail.service';
import { resolveOutboxMail } from './mail-outbox-templates';
import { SmsService } from './sms.service';
import {
  asScalarString,
  payloadAsRecord,
} from './notification-outbox-delivery.helpers';
import { ObservabilityService } from '../observability/observability.service';
import {
  classifyDeliveryError,
  redactAttemptErrorMessage,
} from '../notifications/notification-redaction.helpers';

@Injectable()
export class NotificationOutboxDeliveryService {
  private readonly logger = new Logger(NotificationOutboxDeliveryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
    private readonly config: ConfigService,
    private readonly observability: ObservabilityService,
    @InjectQueue(MAIL_QUEUE_NAME) private readonly mailQueue: Queue,
  ) {}

  /**
   * Queue delivery for a notification_outbox row.
   *
   * Uses jobId = outboxId so BullMQ deduplicates concurrent enqueue calls
   * for the same row (e.g. backfill + direct enqueue racing). Note: BullMQ
   * deduplicates only while the job is waiting/active; a completed job's ID
   * can be reused once it leaves the queue. The DB PROCESSING claim in
   * deliverOutbox is the second guard against double-dispatch.
   */
  async enqueueDelivery(outboxId: string): Promise<void> {
    await this.mailQueue.add(
      JOB_NOTIFICATION_OUTBOX,
      { outboxId },
      { jobId: outboxId },
    );
  }

  /**
   * Send email for a PENDING outbox row; updates status to SENT, FAILED, or PENDING (retry).
   */
  async deliverOutbox(outboxId: string): Promise<void> {
    const row = await this.prisma.notificationOutbox.findUnique({
      where: { id: outboxId },
    });
    if (!row) {
      throw new Error(`NotificationOutbox not found: ${outboxId}`);
    }
    if (row.suppressed) {
      return;
    }
    if (
      row.status === NotificationStatus.SENT ||
      row.status === NotificationStatus.FAILED
    ) {
      return;
    }
    if (row.status === NotificationStatus.PROCESSING) {
      return;
    }

    const claimed = await this.prisma.notificationOutbox.updateMany({
      where: { id: outboxId, status: NotificationStatus.PENDING },
      data: { status: NotificationStatus.PROCESSING },
    });
    if (claimed.count === 0) {
      return;
    }

    const current = await this.prisma.notificationOutbox.findUniqueOrThrow({
      where: { id: outboxId },
    });

    const maxAttempts = this.config.get<number>(
      'NOTIFICATION_OUTBOX_MAX_ATTEMPTS',
      8,
    );
    const attemptNumber = current.attempts + 1;
    const startedAt = new Date();

    try {
      await this.dispatchChannel(current);
      const finishedAt = new Date();
      await this.prisma.$transaction([
        this.prisma.notificationDeliveryAttempt.create({
          data: {
            outboxId,
            attemptNumber,
            outcome: NotificationAttemptOutcome.SUCCESS,
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            startedAt,
            finishedAt,
          },
        }),
        this.prisma.notificationOutbox.update({
          where: { id: outboxId },
          data: {
            status: NotificationStatus.SENT,
            sentAt: finishedAt,
            lastError: null,
          },
        }),
      ]);
      this.observability.recordNotificationDeliveryAttempt({
        category: current.category ?? undefined,
        channel: current.channel,
        outcome: 'success',
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const failed = attemptNumber >= maxAttempts;
      const finishedAt = new Date();
      await this.prisma.$transaction([
        this.prisma.notificationDeliveryAttempt.create({
          data: {
            outboxId,
            attemptNumber,
            outcome: failed
              ? NotificationAttemptOutcome.FAILURE
              : NotificationAttemptOutcome.RETRY_SCHEDULED,
            errorClass: classifyDeliveryError(message),
            errorMessage: redactAttemptErrorMessage(message),
            durationMs: finishedAt.getTime() - startedAt.getTime(),
            startedAt,
            finishedAt,
          },
        }),
        this.prisma.notificationOutbox.update({
          where: { id: outboxId },
          data: {
            attempts: attemptNumber,
            lastError: redactAttemptErrorMessage(message),
            status: failed
              ? NotificationStatus.FAILED
              : NotificationStatus.PENDING,
            deadLetterAckStatus: failed ? DeadLetterAckStatus.OPEN : null,
          },
        }),
      ]);
      this.observability.recordNotificationDeliveryAttempt({
        category: current.category ?? undefined,
        channel: current.channel,
        outcome: failed ? 'failure' : 'retry',
      });
      if (failed) {
        this.logger.error(
          `Outbox ${outboxId} permanently failed after ${attemptNumber} attempts: ${classifyDeliveryError(message)}`,
        );
        return;
      }
      throw err;
    }
  }

  private async dispatchChannel(row: {
    channel: NotificationChannel;
    eventName: string;
    recipient: string;
    payload: unknown;
  }): Promise<void> {
    switch (row.channel) {
      case NotificationChannel.EMAIL: {
        const resolved = resolveOutboxMail(row.eventName, row.payload);
        if (!resolved) {
          throw new Error(`No email template for event: ${row.eventName}`);
        }
        await this.mailService.sendTemplatedEmail({
          to: row.recipient,
          subject: resolved.subject,
          template: resolved.template,
          context: resolved.context,
        });
        return;
      }
      case NotificationChannel.SMS: {
        const p = payloadAsRecord(row.payload);
        await this.smsService.send(
          row.recipient,
          asScalarString(p.text).slice(0, 480),
        );
        return;
      }
      case NotificationChannel.SLACK: {
        const p = payloadAsRecord(row.payload);
        const text = asScalarString(p.text);

        // SSRF guard: only call real Slack webhook endpoints
        let slackUrl: URL;
        try {
          slackUrl = new URL(row.recipient);
        } catch {
          throw new Error(`Invalid Slack webhook URL: ${row.recipient}`);
        }
        if (
          slackUrl.protocol !== 'https:' ||
          !slackUrl.hostname.endsWith('.slack.com')
        ) {
          throw new Error(
            `Slack webhook host not allowed: ${slackUrl.hostname}`,
          );
        }

        const res = await fetch(row.recipient, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Slack webhook ${res.status}: ${body}`);
        }
        return;
      }
      default: {
        const channel = String(row.channel);
        throw new Error(`Unsupported notification channel: ${channel}`);
      }
    }
  }
}
