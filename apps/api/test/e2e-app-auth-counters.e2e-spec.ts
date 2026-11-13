import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import Redis from 'ioredis';
import { MAIL_QUEUE_NAME, PAYOUT_QUEUE_NAME } from '../src/constants';
import { MEDIA_QUEUE } from '../src/media/media.constants';
import {
  authRateLimitIdentityKey,
  authRateLimitIpKey,
} from '../src/auth/auth-rate-limit';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

/**
 * TTW-208: every suite starts from empty IP counters. The customer auth IP limit is 40 a
 * minute and is shared by all suites running back to back, so without this a suite that
 * logs in a lot made a later one (auth-role) answer 429.
 */
describe('createE2eApp auth counters (e2e)', () => {
  let redis: Redis;
  const ipKeys = [
    authRateLimitIpKey('customer_auth', '203.0.113.9'),
    authRateLimitIpKey('admin_login', '203.0.113.9'),
  ];
  const identityKey = authRateLimitIdentityKey(
    'customer_auth',
    'ttw208-identity@example.com',
  );

  beforeAll(() => {
    redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB || 0),
      maxRetriesPerRequest: 1,
    });
  });

  afterAll(async () => {
    await redis.del(identityKey, ...ipKeys);
    redis.disconnect();
  });

  it('clears the IP counters left by earlier suites and keeps identity counters', async () => {
    await redis.set(ipKeys[0], '39', 'EX', 60);
    await redis.set(ipKeys[1], '39', 'EX', 60);
    await redis.set(identityKey, '3', 'EX', 60);

    const app = await createE2eApp();
    try {
      expect(await redis.exists(...ipKeys)).toBe(0);
      expect(await redis.get(identityKey)).toBe('3');
      // The queues open their Redis connections in the background. Closing the app before
      // they are ready makes BullMQ raise "Connection is closed" a moment later, inside
      // whichever suite runs next (seen on CI: products, site-settings-default).
      for (const name of [MAIL_QUEUE_NAME, PAYOUT_QUEUE_NAME, MEDIA_QUEUE]) {
        await app
          .get<Queue>(getQueueToken(name), { strict: false })
          .waitUntilReady();
      }
    } finally {
      await closeE2eApp(app);
    }
  });
});
