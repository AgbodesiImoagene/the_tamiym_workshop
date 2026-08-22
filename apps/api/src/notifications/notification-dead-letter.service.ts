import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeadLetterAckStatus,
  NotificationChannel,
  NotificationStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { ObservabilityService } from '../observability/observability.service';
import {
  maskNotificationRecipient,
  redactAttemptErrorMessage,
} from './notification-redaction.helpers';

export const NOTIFICATION_DEAD_LETTER_BATCH_MAX = 25;

@Injectable()
export class NotificationDeadLetterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dispatch: NotificationDispatchService,
    private readonly observability: ObservabilityService,
    private readonly config: ConfigService,
  ) {}

  async listDeadLetters(query: {
    channel?: NotificationChannel;
    eventName?: string;
    ackStatus?: DeadLetterAckStatus;
    limit?: number;
    cursor?: string;
  }) {
    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100);
    const rows = await this.prisma.notificationOutbox.findMany({
      where: {
        status: NotificationStatus.FAILED,
        ...(query.channel ? { channel: query.channel } : {}),
        ...(query.eventName ? { eventName: query.eventName } : {}),
        ...(query.ackStatus ? { deadLetterAckStatus: query.ackStatus } : {}),
        ...(query.cursor ? { id: { lt: query.cursor } } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      take: limit,
      select: {
        id: true,
        eventName: true,
        channel: true,
        recipient: true,
        category: true,
        policyVersion: true,
        effectKey: true,
        generation: true,
        attempts: true,
        lastError: true,
        deadLetterAckStatus: true,
        deadLetterAckAt: true,
        updatedAt: true,
        createdAt: true,
      },
    });

    return {
      items: rows.map((row) => ({
        ...row,
        recipient: maskNotificationRecipient(row.channel, row.recipient),
        lastError: row.lastError
          ? redactAttemptErrorMessage(row.lastError)
          : null,
      })),
      nextCursor: rows.length === limit ? rows[rows.length - 1]?.id : null,
    };
  }

  async getDeadLetter(id: string) {
    const row = await this.prisma.notificationOutbox.findFirst({
      where: { id, status: NotificationStatus.FAILED },
      include: {
        deliveryAttempts: {
          orderBy: { attemptNumber: 'asc' },
        },
        replayedFrom: {
          select: { id: true, generation: true, status: true },
        },
        replays: {
          select: { id: true, generation: true, status: true },
          orderBy: { generation: 'asc' },
        },
      },
    });
    if (!row) {
      throw new NotFoundException('Dead letter not found.');
    }
    return {
      ...row,
      recipient: maskNotificationRecipient(row.channel, row.recipient),
      lastError: row.lastError
        ? redactAttemptErrorMessage(row.lastError)
        : null,
      deliveryAttempts: row.deliveryAttempts.map((attempt) => ({
        ...attempt,
        errorMessage: attempt.errorMessage
          ? redactAttemptErrorMessage(attempt.errorMessage)
          : null,
      })),
    };
  }

  async acknowledgeDeadLetter(id: string, adminUserId: string, note?: string) {
    const updated = await this.prisma.notificationOutbox.updateMany({
      where: { id, status: NotificationStatus.FAILED },
      data: {
        deadLetterAckStatus: DeadLetterAckStatus.ACKNOWLEDGED,
        deadLetterAckAt: new Date(),
        deadLetterAckByUserId: adminUserId,
        deadLetterAckNote: note?.slice(0, 2000) ?? null,
      },
    });
    if (updated.count === 0) {
      throw new NotFoundException('Dead letter not found.');
    }
    return this.getDeadLetter(id);
  }

  async replayDeadLetter(id: string, adminUserId: string, reason: string) {
    const trimmedReason = reason.trim();
    if (!trimmedReason) {
      throw new BadRequestException('Replay reason is required.');
    }

    const original = await this.prisma.notificationOutbox.findFirst({
      where: { id, status: NotificationStatus.FAILED },
    });
    if (!original) {
      throw new NotFoundException('Dead letter not found.');
    }
    if (!original.effectKey) {
      throw new BadRequestException(
        'Dead letter is missing effect key metadata.',
      );
    }

    const maxGeneration = await this.prisma.notificationOutbox.aggregate({
      where: {
        effectKey: original.effectKey,
        channel: original.channel,
      },
      _max: { generation: true },
    });
    const nextGeneration =
      (maxGeneration._max.generation ?? original.generation) + 1;

    const sentExists = await this.prisma.notificationOutbox.findFirst({
      where: {
        effectKey: original.effectKey,
        channel: original.channel,
        generation: nextGeneration,
        status: NotificationStatus.SENT,
        suppressed: false,
      },
    });
    if (sentExists) {
      this.observability.recordNotificationDeadLetterReplay({
        outcome: 'denied',
      });
      throw new BadRequestException(
        'A successful delivery already exists for the next generation.',
      );
    }

    const result = await this.dispatch.dispatch({
      eventName: original.eventName,
      channel: original.channel,
      recipient: original.recipient,
      recipientUserId: original.recipientUserId,
      payload: original.payload as Record<string, unknown>,
      effectKey: original.effectKey,
      generation: nextGeneration,
      replayedFromId: original.id,
      forceQueue: true,
    });

    await this.prisma.notificationOutbox.update({
      where: { id: original.id },
      data: {
        deadLetterAckStatus: DeadLetterAckStatus.ACKNOWLEDGED,
        deadLetterAckAt: new Date(),
        deadLetterAckByUserId: adminUserId,
        deadLetterAckNote: trimmedReason.slice(0, 2000),
      },
    });

    this.observability.recordNotificationDeadLetterReplay({
      outcome: 'success',
    });

    return {
      replayOutboxId: result.outboxId,
      generation: nextGeneration,
      queued: result.queued,
    };
  }

  async replayDeadLettersBulk(
    ids: string[],
    adminUserId: string,
    reason: string,
  ) {
    const max = this.config.get<number>(
      'NOTIFICATION_DEAD_LETTER_BATCH_MAX',
      NOTIFICATION_DEAD_LETTER_BATCH_MAX,
    );
    if (ids.length === 0) {
      throw new BadRequestException('At least one dead-letter id is required.');
    }
    if (ids.length > max) {
      throw new BadRequestException(`Bulk replay is limited to ${max} items.`);
    }

    const results = [];
    for (const id of ids) {
      try {
        results.push({
          id,
          ...(await this.replayDeadLetter(id, adminUserId, reason)),
        });
      } catch (error) {
        results.push({
          id,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
    return { results };
  }
}
