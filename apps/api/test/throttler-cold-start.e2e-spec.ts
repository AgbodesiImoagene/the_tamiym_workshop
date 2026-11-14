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
 * environment.
 *
 * It waits until the storage's client reports `ready` (a few milliseconds
 * after creation) and only then sends the first throttled request. A client
 * that connects at creation passes; a lazy one never connects before its first
 * command, which is rejected, so it fails here. A request sent in the few
 * milliseconds BEFORE the client is ready is still rejected by design (fail
 * fast, no offline queue): production boots much longer than that before it
 * listens, and this spec does not claim otherwise.
 */
@Controller('ttw214-probe')
@UseGuards(ThrottlerGuard)
class ThrottlerProbeController {
  @Get()
  probe() {
    return { ok: true };
  }
}

describe('Throttler Redis storage on the first request after boot (e2e)', () => {
  let app: INestApplication<App>;
  let storage: ThrottlerStorageRedisService;

  beforeAll(async () => {
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
    // Closing the module must also disconnect the storage's Redis client (the
    // storage owns it when it is given options, not a client), or the CI
    // open-handle proof would report it.
    await app.close();
    // ioredis ends the connection asynchronously after disconnect().
    const deadline = Date.now() + 3_000;
    while (storage.redis.status !== 'end' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    expect(storage.redis.status).toBe('end');
  });

  it('serves the first throttled request once the client is ready instead of a 500', async () => {
    // Give a client that connects at creation time to become ready (~25 ms).
    const deadline = Date.now() + 3_000;
    while (storage.redis.status !== 'ready' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    const first = await request(app.getHttpServer()).get('/ttw214-probe');
    expect(first.status).toBe(200);
  });

  it('keeps serving: the next request is counted and answered normally', async () => {
    const next = await request(app.getHttpServer()).get('/ttw214-probe');
    expect(next.status).toBe(200);
  });
});
