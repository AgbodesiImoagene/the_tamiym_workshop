import { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import request from 'supertest';
import type { App } from 'supertest/types';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { AUTH_RATE_LIMIT_KEY_PREFIX } from '../src/auth/auth-rate-limit';
import { AUTH_RATE_LIMIT_BUCKETS } from '../src/constants';

const CUSTOMER_ORIGIN = 'http://localhost:3000';

/**
 * The IP counter is shared by every suite that logs in within the same minute, and the
 * suites run back to back from the same address. Without this reset the 41st login of
 * the minute, made by other suites, is throttled before this test starts its own count
 * (CI failure on main after TTW-087 added suites that log in).
 */
async function resetCustomerAuthIpCounters() {
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 0),
    maxRetriesPerRequest: 1,
  });
  try {
    const keys = await redis.keys(
      `${AUTH_RATE_LIMIT_KEY_PREFIX}:ip:customer_auth:*`,
    );
    if (keys.length > 0) await redis.del(...keys);
  } finally {
    redis.disconnect();
  }
}

/**
 * Redis-backed identity+IP auth throttles (TTW-023 slice 4).
 * Uses a unique email per suite so identity limits are isolated from other e2e.
 */
describe('Auth rate limits (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createE2eApp();
    await resetCustomerAuthIpCounters();
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  it('returns 429 after customer login identity limit is exceeded', async () => {
    const email = `throttle-${Date.now()}@example.com`;
    const password = 'WrongPassword1!';
    const limit = AUTH_RATE_LIMIT_BUCKETS.customer_auth.identityLimit;

    for (let i = 0; i < limit; i += 1) {
      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .set('Origin', CUSTOMER_ORIGIN)
        .send({ email, password })
        .expect(401);
    }

    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('Origin', CUSTOMER_ORIGIN)
      .send({ email, password })
      .expect(429);
  });
});
