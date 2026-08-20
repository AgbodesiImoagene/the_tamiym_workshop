import { ConfigService } from '@nestjs/config';
import { ThrottlerStorageRedisService } from '@nest-lab/throttler-storage-redis';
import Redis from 'ioredis';

/** Shared Redis connection options for BullMQ / throttler / auth rate limits. */
export function redisConnectionOptions(config: ConfigService): {
  host: string;
  port: number;
  password: string | undefined;
  db: number;
} {
  return {
    host: config.get<string>('REDIS_HOST', 'localhost'),
    port: Number(config.get<string | number>('REDIS_PORT', 6379)),
    password: config.get<string>('REDIS_PASSWORD') || undefined,
    db: Number(config.get<string | number>('REDIS_DB', 0)),
  };
}

/** Nest Throttler Redis storage (multi-replica IP limits for non-auth routes). */
export function createThrottlerRedisStorage(
  config: ConfigService,
): ThrottlerStorageRedisService {
  return new ThrottlerStorageRedisService(
    new Redis({
      ...redisConnectionOptions(config),
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: true,
    }),
  );
}

export function createThrottlerModuleOptions(config: ConfigService) {
  return {
    throttlers: [{ name: 'default', ttl: 60_000, limit: 100 }],
    storage: createThrottlerRedisStorage(config),
  };
}
