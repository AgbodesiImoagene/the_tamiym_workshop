import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import {
  getStorageToken,
  ThrottlerGuard,
  ThrottlerModule,
} from '@nestjs/throttler';
import type { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import request from 'supertest';
import { App } from 'supertest/types';
import { createThrottlerModuleOptions } from '../src/config/throttler-redis.factory';

/**
 * TTW-214: the throttler storage uses a Redis client with no offline queue (it
 * must fail fast). Such a client rejects every command until it is connected, so
 * a client that connects lazily made the FIRST throttled request after a boot
 * answer 500 ("Stream isn't writeable"). TTW-211 fixed it.
 *
 * `AppModule` keeps the throttler in memory under NODE_ENV=test (see
 * app.module.ts), so the full e2e app never touches this storage. This spec
 * therefore builds a minimal application with the production factory
 * (`createThrottlerModuleOptions`) against the real Redis of the test
 * environment (db 15 unless REDIS_DB says otherwise, like global-setup).
 *
 * It waits until the storage's client reports `ready` (about 26 ms after
 * creation on a development machine) and only then sends the first throttled
 * request. A client that connects at creation passes; a lazy one never
 * connects before its first command, which is rejected, so it never becomes
 * ready and the wait fails with a clear message. A request sent in the few
 * milliseconds BEFORE the client is ready is still rejected by design (fail
 * fast, no offline queue). How long a production boot takes before it listens
 * was not measured; this spec does not claim it is longer than that.
 */
@Controller('ttw214-probe')
@UseGuards(ThrottlerGuard)
class ThrottlerProbeController {
  @Get()
  probe() {
    return { ok: true };
  }
}

/** Polls until the ioredis client reaches `status`, or fails with a clear message. */
async function waitForStatus(
  client: ThrottlerStorageRedisService['redis'],
  status: string,
  timeoutMs = 3_000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (client.status !== status && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  if (client.status !== status) {
    const { host, port, db } = client.options as {
      host?: string;
      port?: number;
      db?: number;
    };
    throw new Error(
      `Redis client is still '${client.status}', expected '${status}' after ${timeoutMs} ms (Redis at ${host}:${port}, db ${db})`,
    );
  }
}

describe('Throttler Redis storage on the first request after boot (e2e)', () => {
  const previousRedisDb = process.env.REDIS_DB;
  let app: INestApplication<App> | undefined;
  let storage: ThrottlerStorageRedisService | undefined;

  beforeAll(async () => {
    // Same default as global-setup/teardown, so the throttler key never lands
    // in db 0 (shared with a development API) when REDIS_DB is not set.
    process.env.REDIS_DB = process.env.REDIS_DB || '15';
    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ ignoreEnvFile: true }),
        ThrottlerModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) =>
            createThrottlerModuleOptions(config),
        }),
      ],
      controllers: [ThrottlerProbeController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    storage = moduleRef.get<ThrottlerStorageRedisService>(getStorageToken());
  });

  afterAll(async () => {
    try {
      // Closing the module must also disconnect the storage's Redis client (the
      // storage owns it when it is given options, not a client), or the CI
      // open-handle proof would report it. Guarded so a failed beforeAll shows
      // its own error instead of a TypeError from here.
      await app?.close();
      if (storage) {
        // ioredis ends the connection asynchronously after disconnect().
        await waitForStatus(storage.redis, 'end');
      }
    } finally {
      if (previousRedisDb === undefined) delete process.env.REDIS_DB;
      else process.env.REDIS_DB = previousRedisDb;
    }
  });

  it('serves the first throttled request once the client is ready instead of a 500', async () => {
    await waitForStatus(storage!.redis, 'ready');
    const first = await request(app!.getHttpServer()).get('/ttw214-probe');
    expect(first.status).toBe(200);
  });

  it('counts the requests in Redis: each hit raises the stored total by one', async () => {
    const increment = jest.spyOn(storage!, 'increment');
    await request(app!.getHttpServer()).get('/ttw214-probe').expect(200);
    await request(app!.getHttpServer()).get('/ttw214-probe').expect(200);

    expect(increment).toHaveBeenCalledTimes(2);
    const [first, second] = await Promise.all(
      increment.mock.results.map(
        (r) => r.value as Promise<{ totalHits: number }>,
      ),
    );
    expect(second.totalHits).toBe(first.totalHits + 1);
  });
});
