import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationStatus,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { ObservabilityService } from '../observability/observability.service';
import {
  buildNotificationEffectKey,
  classifyNotificationEvent,
  evaluateNotificationPolicy,
  NOTIFICATION_POLICY_VERSION,
  toPreferenceChannel,
} from './notification-policy';

export type DispatchNotificationInput = {
  tx?: Prisma.TransactionClient;
  eventName: string;
  channel: NotificationChannel;
  recipient: string;
  recipientUserId?: string | null;
  payload: Record<string, unknown>;
  dedupeKey?: string | null;
  effectKey?: string | null;
  generation?: number;
  replayedFromId?: string | null;
  scheduledAt?: Date;
  enqueue?: boolean;
  /** Admin replay bypasses optional preference re-check (generation already authorized). */
  forceQueue?: boolean;
};

export type DispatchNotificationResult = {
  outboxId: string;
  queued: boolean;
  suppressed: boolean;
  decisionCode: string;
  policyVersion: string;
  category: string | null;
  idempotentReuse?: boolean;
};

@Injectable()
export class NotificationDispatchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxDelivery: NotificationOutboxDeliveryService,
    private readonly observability: ObservabilityService,
  ) {}

  async dispatch(
    input: DispatchNotificationInput,
  ): Promise<DispatchNotificationResult> {
    const client = input.tx ?? this.prisma;
    const taxonomy = classifyNotificationEvent(input.eventName);
    const preferenceChannel = toPreferenceChannel(input.channel);

    const preference =
      input.recipientUserId && preferenceChannel && taxonomy?.preferenceApplies
        ? await client.notificationPreference.findUnique({
            where: {
              userId_channel_category: {
                userId: input.recipientUserId,
                channel: preferenceChannel,
                category: taxonomy.category,
              },
            },
          })
        : null;

    const marketingConsent =
      input.recipientUserId &&
      preferenceChannel &&
      taxonomy?.requiresMarketingConsent
        ? await client.notificationConsent.findFirst({
            where: {
              userId: input.recipientUserId,
              channel: preferenceChannel,
              category: NotificationCategory.MARKETING,
            },
            orderBy: { createdAt: 'desc' },
          })
        : null;

    const evaluation = evaluateNotificationPolicy({
      eventName: input.eventName,
      channel: input.channel,
      recipient: input.recipient,
      recipientUserId: input.recipientUserId,
      preference: preference ? { enabled: preference.enabled } : null,
      marketingConsent: marketingConsent
        ? { granted: marketingConsent.granted }
        : null,
    });

    const effectiveEvaluation = input.forceQueue
      ? {
          ...evaluation,
          queue: true,
          suppressed: false,
          suppressionReason: null,
          decisionCode:
            evaluation.decisionCode === 'NOTIFICATION_TAXONOMY_UNMAPPED'
              ? evaluation.decisionCode
              : ('NOTIFICATION_QUEUED' as const),
        }
      : evaluation;

    const effectKey =
      input.effectKey ??
      buildNotificationEffectKey({
        eventName: input.eventName,
        channel: input.channel,
        recipient: input.recipient,
        recipientUserId: input.recipientUserId,
        dedupeKey: input.dedupeKey,
      });
    const generation = input.generation ?? 1;

    if (input.dedupeKey) {
      const existing = await client.notificationOutbox.findUnique({
        where: { dedupeKey: input.dedupeKey },
      });
      if (existing) {
        this.observability.recordNotificationDispatch({
          category: evaluation.category ?? undefined,
          channel: input.channel,
          outcome: 'duplicate',
        });
        return {
          outboxId: existing.id,
          queued: existing.status === NotificationStatus.PENDING,
          suppressed: existing.suppressed,
          decisionCode: evaluation.decisionCode,
          policyVersion: existing.policyVersion ?? NOTIFICATION_POLICY_VERSION,
          category: existing.category,
          idempotentReuse: true,
        };
      }
    }

    const existingGeneration = await client.notificationOutbox.findFirst({
      where: { effectKey, channel: input.channel, generation },
    });
    if (existingGeneration) {
      this.observability.recordNotificationDispatch({
        category: evaluation.category ?? undefined,
        channel: input.channel,
        outcome: 'duplicate',
      });
      return {
        outboxId: existingGeneration.id,
        queued: existingGeneration.status === NotificationStatus.PENDING,
        suppressed: existingGeneration.suppressed,
        decisionCode: evaluation.decisionCode,
        policyVersion:
          existingGeneration.policyVersion ?? NOTIFICATION_POLICY_VERSION,
        category: existingGeneration.category,
        idempotentReuse: true,
      };
    }

    const row = await client.notificationOutbox.create({
      data: {
        eventName: input.eventName,
        channel: input.channel,
        recipient: input.recipient,
        recipientUserId: input.recipientUserId ?? null,
        payload: input.payload as Prisma.InputJsonValue,
        dedupeKey: input.dedupeKey ?? null,
        category: effectiveEvaluation.category,
        policyVersion: effectiveEvaluation.policyVersion,
        effectKey,
        generation,
        suppressed: effectiveEvaluation.suppressed,
        suppressionReason: effectiveEvaluation.suppressionReason,
        suppressionReasonCode: effectiveEvaluation.decisionCode,
        replayedFromId: input.replayedFromId ?? null,
        status: effectiveEvaluation.suppressed
          ? NotificationStatus.SENT
          : NotificationStatus.PENDING,
        sentAt: effectiveEvaluation.suppressed ? new Date() : null,
        scheduledAt: input.scheduledAt ?? new Date(),
        deadLetterAckStatus: null,
      },
    });

    const shouldEnqueue =
      effectiveEvaluation.queue &&
      input.enqueue !== false &&
      !effectiveEvaluation.suppressed;
    if (shouldEnqueue && !input.tx) {
      await this.outboxDelivery.enqueueDelivery(row.id);
    }

    this.observability.recordNotificationDispatch({
      category: evaluation.category ?? undefined,
      channel: input.channel,
      outcome: effectiveEvaluation.suppressed ? 'suppressed' : 'queued',
    });

    return {
      outboxId: row.id,
      queued: shouldEnqueue,
      suppressed: effectiveEvaluation.suppressed,
      decisionCode: effectiveEvaluation.decisionCode,
      policyVersion: effectiveEvaluation.policyVersion,
      category: effectiveEvaluation.category,
    };
  }
}
