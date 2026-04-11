import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationStatus } from '../generated/prisma/enums';
import { ObservabilityService } from '../observability/observability.service';
import { runWithRequestContext } from '../request-context/request-context.store';
import { NotificationOutboxDeliveryService } from './notification-outbox-delivery.service';

const BACKFILL_BATCH = 50;

/**
 * Requeues stranded PENDING notifications and resets stale PROCESSING rows.
 */
@Injectable()
export class NotificationOutboxBackfillService {
  private readonly logger = new Logger(NotificationOutboxBackfillService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly delivery: NotificationOutboxDeliveryService,
    private readonly observability: ObservabilityService,
  ) {}

  @Cron('*/2 * * * *')
  async runOutboxMaintenance(): Promise<void> {
    const now = new Date();
    return runWithRequestContext(
      {
        requestId: `cron:notification-outbox:${now.toISOString()}`,
        source: 'CRON',
      },
      () =>
        this.observability.startSpan(
          'cron.notifications.outbox_maintenance',
          {},
          async () => {
            await this.resetStaleProcessing();
            await this.enqueuePendingBatch();
          },
        ),
    );
  }

  private async resetStaleProcessing(): Promise<void> {
    const minutes = this.config.get<number>(
      'NOTIFICATION_OUTBOX_STALE_PROCESSING_MINUTES',
      15,
    );
    const cutoff = new Date(Date.now() - minutes * 60_000);
    const result = await this.prisma.notificationOutbox.updateMany({
      where: {
        status: NotificationStatus.PROCESSING,
        updatedAt: { lt: cutoff },
      },
      data: { status: NotificationStatus.PENDING },
    });
    if (result.count > 0) {
      this.logger.warn(
        `Reset ${result.count} stale PROCESSING notification(s) to PENDING`,
      );
    }
  }

  private async enqueuePendingBatch(): Promise<void> {
    const batchSize = this.config.get<number>(
      'NOTIFICATION_OUTBOX_BACKFILL_BATCH',
      BACKFILL_BATCH,
    );
    const now = new Date();
    const pending = await this.prisma.notificationOutbox.findMany({
      where: {
        status: NotificationStatus.PENDING,
        scheduledAt: { lte: now },
      },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
      take: batchSize,
    });
    for (const row of pending) {
      await this.delivery.enqueueDelivery(row.id);
    }
    // When the batch is saturated the queue is likely falling behind. Alert so
    // operators know to scale workers or increase the batch size.
    if (pending.length >= batchSize) {
      this.logger.warn(
        `Notification outbox backfill batch was full (${pending.length}/${batchSize}). ` +
          'The queue may be lagging. Consider scaling workers or increasing ' +
          'NOTIFICATION_OUTBOX_BACKFILL_BATCH.',
      );
    }
  }
}
