import { ConfigService } from '@nestjs/config';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({ status: 'ready' }));
});

jest.mock('@nest-lab/throttler-storage-redis', () => ({
  ThrottlerStorageRedisService: jest
    .fn()
    .mockImplementation((client: unknown) => ({ client })),
}));

import {
  createThrottlerModuleOptions,
  redisConnectionOptions,
} from './throttler-redis.factory';

describe('throttler-redis.factory', () => {
  const config = {
    get: (key: string, fallback?: string | number) => {
      if (key === 'REDIS_HOST') return 'redis.internal';
      if (key === 'REDIS_PORT') return '6380';
      if (key === 'REDIS_PASSWORD') return 'secret';
      if (key === 'REDIS_DB') return '2';
      return fallback;
    },
  } as ConfigService;

  it('reads REDIS_* connection options', () => {
    expect(redisConnectionOptions(config)).toEqual({
      host: 'redis.internal',
      port: 6380,
      password: 'secret',
      db: 2,
    });
  });

  it('builds throttler module options with redis storage', () => {
    const options = createThrottlerModuleOptions(config);
    expect(options.throttlers).toEqual([
      { name: 'default', ttl: 60_000, limit: 100 },
    ]);
    expect(options.storage).toEqual({ client: expect.anything() });
  });
});
