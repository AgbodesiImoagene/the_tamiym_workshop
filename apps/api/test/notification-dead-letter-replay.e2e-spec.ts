import { INestApplication } from '@nestjs/common';
import { App } from 'supertest/types';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { NotificationDeadLetterService } from '../src/notifications/notification-dead-letter.service';
import {
  DeadLetterAckStatus,
  NotificationChannel,
  NotificationStatus,
} from '../src/generated/prisma/enums';

/**
 * TTW-110: an admin resends a failed e-mail. The same effect is never delivered
 * twice, whether the admin clicks twice in a row or two admins click at once.
 * Real Postgres, real services.
 */
describe('Dead-letter replay (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let deadLetters: NotificationDeadLetterService;
  const effectKeys: string[] = [];

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    deadLetters = app.get(NotificationDeadLetterService);
  });

  afterAll(async () => {
    if (effectKeys.length > 0) {
      // Delete replays first: they point at their original row.
      await prisma.notificationOutbox.deleteMany({
        where: { effectKey: { in: effectKeys }, generation: { gt: 1 } },
      });
      await prisma.notificationOutbox.deleteMany({
        where: { effectKey: { in: effectKeys } },
      });
    }
    await closeE2eApp(app);
  });

  /** A failed, acknowledged confirmation e-mail, ready to be resent. */
  async function seedFailedEmail(suffix: string) {
    const effectKey = `PaymentConfirmed:ttw110-${suffix}:EMAIL`;
    effectKeys.push(effectKey);
    return prisma.notificationOutbox.create({
      data: {
        eventName: 'PaymentConfirmed',
        channel: NotificationChannel.EMAIL,
        recipient: `ttw110-${suffix}@example.com`,
        payload: { orderNumber: 'TTW-110' },
        effectKey,
        generation: 1,
        status: NotificationStatus.FAILED,
        attempts: 3,
        lastError: 'SMTP timeout',
        deadLetterAckStatus: DeadLetterAckStatus.ACKNOWLEDGED,
        deadLetterAckAt: new Date(),
      },
    });
  }

  const generationsOf = (effectKey: string) =>
    prisma.notificationOutbox.findMany({
      where: { effectKey },
      orderBy: { generation: 'asc' },
      select: { generation: true, status: true },
    });

  it('replays a failed e-mail as the next generation', async () => {
    const failed = await seedFailedEmail(`single-${Date.now()}`);

    const result = await deadLetters.replayDeadLetter(
      failed.id,
      'admin-1',
      'provider outage is over',
    );

    expect(result.generation).toBe(2);
    expect(await generationsOf(failed.effectKey!)).toHaveLength(2);
  });

  it('refuses a second replay once the first one is queued or delivered', async () => {
    const failed = await seedFailedEmail(`twice-${Date.now()}`);

    await deadLetters.replayDeadLetter(failed.id, 'admin-1', 'first resend');
    await expect(
      deadLetters.replayDeadLetter(failed.id, 'admin-1', 'second resend'),
    ).rejects.toMatchObject({ status: 400 });

    // Still exactly one replay: generation 1 (failed) and generation 2.
    expect(await generationsOf(failed.effectKey!)).toHaveLength(2);
  });

  it('lets an admin resend the newest generation when its replay failed too', async () => {
    const failed = await seedFailedEmail(`retry-${Date.now()}`);

    const first = await deadLetters.replayDeadLetter(
      failed.id,
      'admin-1',
      'first resend',
    );
    // The replay failed as well and an admin acknowledged it.
    await prisma.notificationOutbox.update({
      where: { id: first.replayOutboxId },
      data: {
        status: NotificationStatus.FAILED,
        deadLetterAckStatus: DeadLetterAckStatus.ACKNOWLEDGED,
        deadLetterAckAt: new Date(),
      },
    });

    // The old generation can no longer be resent: it already has a replay.
    await expect(
      deadLetters.replayDeadLetter(failed.id, 'admin-1', 'resend the old one'),
    ).rejects.toMatchObject({ status: 400 });

    const second = await deadLetters.replayDeadLetter(
      first.replayOutboxId,
      'admin-1',
      'second resend',
    );
    expect(second.generation).toBe(3);
    expect(await generationsOf(failed.effectKey!)).toHaveLength(3);
  });

  it('creates exactly one replay when two admins resend at the same time', async () => {
    const failed = await seedFailedEmail(`race-${Date.now()}`);

    const outcomes = await Promise.allSettled([
      deadLetters.replayDeadLetter(failed.id, 'admin-1', 'resend A'),
      deadLetters.replayDeadLetter(failed.id, 'admin-2', 'resend B'),
    ]);

    const fulfilled = outcomes.filter((o) => o.status === 'fulfilled');
    const rejected = outcomes.filter((o) => o.status === 'rejected');
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    // A clean 400, not an unhandled database error.
    expect(rejected[0].reason).toMatchObject({ status: 400 });
    expect(await generationsOf(failed.effectKey!)).toHaveLength(2);
  });
});
