import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { AUTH_RATE_LIMIT_BUCKETS } from '../src/constants';

const CUSTOMER_ORIGIN = 'http://localhost:3000';

/**
 * Redis-backed identity+IP auth throttles (TTW-023 slice 4).
 * Uses a unique email per suite so identity limits are isolated from other e2e.
 */
describe('Auth rate limits (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createE2eApp();
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
