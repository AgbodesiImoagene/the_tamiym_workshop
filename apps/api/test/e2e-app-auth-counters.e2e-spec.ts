import Redis from 'ioredis';
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
    } finally {
      await closeE2eApp(app);
    }
  });
});
