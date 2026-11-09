import { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { Job, Queue, Worker } from 'bullmq';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  JOB_GOOGLE_LINKED_ACCOUNT_SUSPENDED_EMAIL,
  JOB_PASSWORD_RESET_EMAIL,
  JOB_VERIFICATION_EMAIL,
  MAIL_QUEUE_NAME,
} from '../src/constants';
import { UserRole, UserStatus } from '../src/generated/prisma/client';
import { MailProcessor } from '../src/mail/processors/mail.processor';
import { MailTransportService } from '../src/mail/mail-transport.service';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

/**
 * TTW-184: a reset or verification job that fails for good must not stay in
 * Redis with its link. Drives the real jobs, queued by the real HTTP routes,
 * through the real MailProcessor on a BullMQ worker against real Redis, then
 * reads every key of the mail queue.
 */
describe('Failed reset and verification jobs leave no working link in Redis (TTW-184)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let queue: Queue;
  let mailAdd: jest.SpyInstance;
  let worker: Worker | undefined;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    queue = app.get<Queue>(getQueueToken(MAIL_QUEUE_NAME), { strict: false });
    // e2e runs in band: drop jobs left waiting by earlier suites so the
    // worker below only sees this suite's jobs.
    await queue.drain(true);
    mailAdd = jest.spyOn(queue, 'add');
    jest
      .spyOn(app.get(MailTransportService), 'sendMail')
      .mockRejectedValue(
        Object.assign(new Error('SMTP unavailable'), { code: 'ECONNECTION' }),
      );
  });

  afterAll(async () => {
    await worker?.close();
    if (prisma && createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await closeE2eApp(app);
  });

  async function createUser(verified: boolean): Promise<string> {
    const email = `ttw184-${Date.now()}-${verified ? 'v' : 'u'}@example.com`;
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash('OldPassword123!', 4),
        firstName: 'Link',
        lastName: 'Retention',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: verified ? new Date() : null,
      },
    });
    createdUserIds.push(user.id);
    return email;
  }

  /** Job queued for `jobName`, with the raw token of its link. */
  async function queued(
    jobName: string,
  ): Promise<{ job: Job; rawToken: string }> {
    const index = mailAdd.mock.calls.findIndex(
      ([name]: [string]) => name === jobName,
    );
    if (index < 0) throw new Error(`no ${jobName} queued`);
    const data = mailAdd.mock.calls[index][1] as {
      resetUrl?: string;
      verifyUrl?: string;
    };
    const link = data.resetUrl ?? data.verifyUrl;
    const rawToken = new URL(link as string).searchParams.get('token');
    if (!rawToken) throw new Error('no token in queued link');
    const job = (await mailAdd.mock.results[index].value) as Job;
    return { job, rawToken };
  }

  /** Every value stored under the mail queue's keys, as one string. */
  async function dumpMailQueue(): Promise<string> {
    const redis = await queue.client;
    const keys = await redis.keys(`${queue.qualifiedName}:*`);
    const parts: string[] = [];
    for (const key of keys) {
      const type = await redis.type(key);
      if (type === 'string') parts.push(String(await redis.get(key)));
      if (type === 'hash') parts.push(JSON.stringify(await redis.hgetall(key)));
      if (type === 'list') parts.push(...(await redis.lrange(key, 0, -1)));
      if (type === 'set') parts.push(...(await redis.smembers(key)));
      if (type === 'zset') parts.push(...(await redis.zrange(key, 0, -1)));
      if (type === 'stream') {
        parts.push(JSON.stringify(await redis.xrange(key, '-', '+')));
      }
    }
    return parts.join('\n');
  }

  it('removes both jobs at their final failure while a default mail job stays in the failed set', async () => {
    const verifiedEmail = await createUser(true);
    const unverifiedEmail = await createUser(false);

    await request(app.getHttpServer())
      .post('/v1/auth/forgot-password')
      .send({ email: verifiedEmail })
      .expect(200);
    await request(app.getHttpServer())
      .post('/v1/auth/resend-verification')
      .send({ email: unverifiedEmail })
      .expect(200);
    // Control: a mail job on the queue defaults (same call shape as AuthService).
    await queue.add(JOB_GOOGLE_LINKED_ACCOUNT_SUSPENDED_EMAIL, {
      to: verifiedEmail,
    });

    const reset = await queued(JOB_PASSWORD_RESET_EMAIL);
    const verify = await queued(JOB_VERIFICATION_EMAIL);
    const controlIndex = mailAdd.mock.calls.findIndex(
      ([name]: [string]) => name === JOB_GOOGLE_LINKED_ACCOUNT_SUSPENDED_EMAIL,
    );
    const control = (await mailAdd.mock.results[controlIndex].value) as Job;

    // The scan does see a queued link: the assertions below are not vacuous.
    const before = await dumpMailQueue();
    expect(before).toContain(reset.rawToken);
    expect(before).toContain(verify.rawToken);

    // Simulate the earlier failed attempts so the next run is the last one.
    const redis = await queue.client;
    for (const job of [reset.job, verify.job, control]) {
      const attempts = job.opts.attempts ?? 1;
      expect(attempts).toBeGreaterThan(1);
      await redis.hset(queue.toKey(job.id as string), 'atm', attempts - 1);
    }

    const pending = new Set([reset.job.id, verify.job.id, control.id]);
    const processor = app.get(MailProcessor);
    const done = new Promise<void>((resolve) => {
      worker = new Worker(
        MAIL_QUEUE_NAME,
        (job: Job) => processor.process(job),
        {
          connection: {
            host: process.env.REDIS_HOST ?? 'localhost',
            port: Number(process.env.REDIS_PORT ?? 6379),
            password: process.env.REDIS_PASSWORD || undefined,
            db: Number(process.env.REDIS_DB ?? 0),
          },
        },
      );
      worker.on('failed', (job) => {
        if (job?.id) pending.delete(job.id);
        if (pending.size === 0) resolve();
      });
    });
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      done,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(new Error(`jobs never failed: ${[...pending].join(', ')}`)),
          30_000,
        );
      }),
    ]).finally(() => clearTimeout(timer));

    expect(await queue.getJob(reset.job.id as string)).toBeUndefined();
    expect(await queue.getJob(verify.job.id as string)).toBeUndefined();
    expect(await queue.getJobState(control.id as string)).toBe('failed');

    const after = await dumpMailQueue();
    expect(after).not.toContain(reset.rawToken);
    expect(after).not.toContain(verify.rawToken);
  });
});
