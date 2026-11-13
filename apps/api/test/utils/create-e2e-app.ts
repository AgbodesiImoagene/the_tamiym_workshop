import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Request } from 'express';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { AUTH_RATE_LIMIT_KEY_PREFIX } from '../../src/auth/auth-rate-limit';
import { MAIL_QUEUE_NAME, PAYOUT_QUEUE_NAME } from '../../src/constants';
import { MEDIA_QUEUE } from '../../src/media/media.constants';

const E2E_QUEUE_NAMES = [
  MAIL_QUEUE_NAME,
  PAYOUT_QUEUE_NAME,
  MEDIA_QUEUE,
] as const;

/**
 * TTW-208: forget the IP counters of the auth rate limits. They are shared by every suite
 * (40 customer logins a minute from one address) and suites run back to back, so a suite
 * that logs in a lot made a later one answer 429. Identity counters are left alone: suites
 * use unique e-mails and the rate-limit suite checks them on purpose.
 */
async function resetAuthIpRateLimits(): Promise<void> {
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 0),
    maxRetriesPerRequest: 1,
  });
  try {
    const keys = await redis.keys(`${AUTH_RATE_LIMIT_KEY_PREFIX}:ip:*`);
    if (keys.length > 0) await redis.del(...keys);
  } finally {
    redis.disconnect();
  }
}

/**
 * Boot production AppModule with the same request pipeline essentials as main.ts
 * (validation, cookies, JSON body, v1 prefix, shutdown hooks).
 */
export async function createE2eApp(): Promise<INestApplication<App>> {
  await resetAuthIpRateLimits();
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication({
    bodyParser: false,
  });

  app.use(
    express.json({
      verify: (req: Request & { rawBody?: Buffer }, _res, buf: Buffer) => {
        req.rawBody = buf;
      },
    }),
  );
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.setGlobalPrefix('v1');
  app.enableShutdownHooks();
  await app.init();

  try {
    const registry = app.get(SchedulerRegistry, { strict: false });
    for (const name of [...registry.getCronJobs().keys()]) {
      registry.deleteCronJob(name);
    }
  } catch {
    // no scheduler
  }

  return app;
}

async function withTimeout<T>(
  promise: Promise<T>,
  ms: number,
  label: string,
): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export async function closeE2eApp(
  app: INestApplication<App> | undefined,
): Promise<void> {
  if (!app) return;

  try {
    const registry = app.get(SchedulerRegistry, { strict: false });
    for (const name of [...registry.getCronJobs().keys()]) {
      registry.deleteCronJob(name);
    }
  } catch {
    // Scheduler may be unavailable in partial boots.
  }

  await withTimeout(app.close(), 20_000, 'Nest app.close()');

  for (const name of E2E_QUEUE_NAMES) {
    try {
      const queue = app.get<Queue>(getQueueToken(name), { strict: false });
      await withTimeout(queue.close(), 5_000, `queue.close(${name})`);
    } catch {
      // Queue may already be closed with the Nest application context.
    }
  }
}
