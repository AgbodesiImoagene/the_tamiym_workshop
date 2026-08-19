import { INestApplication, ValidationPipe } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import { Queue } from 'bullmq';
import cookieParser from 'cookie-parser';
import express from 'express';
import type { Request } from 'express';
import { App } from 'supertest/types';
import { AppModule } from '../../src/app.module';
import { MAIL_QUEUE_NAME, PAYOUT_QUEUE_NAME } from '../../src/constants';
import { MEDIA_QUEUE } from '../../src/media/media.constants';

const E2E_QUEUE_NAMES = [
  MAIL_QUEUE_NAME,
  PAYOUT_QUEUE_NAME,
  MEDIA_QUEUE,
] as const;

/**
 * Boot production AppModule with the same request pipeline essentials as main.ts
 * (validation, cookies, JSON body, v1 prefix, shutdown hooks).
 */
export async function createE2eApp(): Promise<INestApplication<App>> {
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
