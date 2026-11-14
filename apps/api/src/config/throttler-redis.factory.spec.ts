import { ConfigService } from '@nestjs/config';

jest.mock('@nest-lab/throttler-storage-redis', () => ({
  ThrottlerStorageRedisService: jest
    .fn()
    .mockImplementation((client: unknown) => ({ client })),
}));

import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
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
    expect(options.storage).toEqual({
      client: expect.objectContaining({ host: 'redis.internal' }),
    });
  });

  // With enableOfflineQueue off, a client that has not connected yet rejects
  // every command ("Stream isn't writeable"). lazyConnect would leave the
  // client unconnected until its first command, so the first request after a
  // boot got a 500 (TTW-211 found it as a cold-start e2e failure).
  // Passing options (not a client) also lets the storage own the client and
  // disconnect it on shutdown.
  it('lets the storage connect and own the client, failing fast without a queue', () => {
    const storage = ThrottlerStorageRedisService as unknown as jest.Mock;
    storage.mockClear();
    createThrottlerModuleOptions(config);
    const [arg] = storage.mock.calls[0] as [Record<string, unknown>];
    expect(arg.lazyConnect).not.toBe(true);
    expect(arg.enableOfflineQueue).toBe(false);
    expect(arg.host).toBe('redis.internal');
  });
});
