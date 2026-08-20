import {
  HttpException,
  HttpStatus,
  Injectable,
  OnModuleDestroy,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { ObservabilityService } from '../observability/observability.service';
import { redisConnectionOptions } from '../config/throttler-redis.factory';
import {
  AUTH_RATE_LIMIT_MESSAGE,
  type AuthRateLimitBucket,
} from '../constants';
import {
  authRateLimitConfig,
  authRateLimitIdentityKey,
  authRateLimitIpKey,
  normalizeAuthThrottleIdentity,
  resolveAuthThrottleIp,
} from './auth-rate-limit';

@Injectable()
export class AuthRateLimitService implements OnModuleDestroy {
  private readonly redis: Redis;

  constructor(
    config: ConfigService,
    private readonly observability: ObservabilityService,
  ) {
    this.redis = new Redis({
      ...redisConnectionOptions(config),
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis.quit().catch(() => undefined);
  }

  /**
   * Consume one attempt for the bucket against both identity and IP keys.
   * Throws 429 when limited, 503 when Redis is unavailable (fail-closed).
   */
  async consume(params: {
    bucket: AuthRateLimitBucket;
    /** Pre-normalized identity key fragment (email or `user:<id>`). */
    identity?: string | null;
    email?: string | null;
    ip?: string | null;
    surface: 'CUSTOMER' | 'ADMIN';
  }): Promise<void> {
    const { bucket, surface } = params;
    const config = authRateLimitConfig(bucket);
    const identity =
      params.identity && params.identity.trim().length > 0
        ? params.identity.trim().toLowerCase()
        : normalizeAuthThrottleIdentity(params.email);
    const ip = resolveAuthThrottleIp(params.ip);
    const idKey = authRateLimitIdentityKey(bucket, identity);
    const ipKey = authRateLimitIpKey(bucket, ip);

    let idCount: number;
    let ipCount: number;
    try {
      [idCount, ipCount] = await Promise.all([
        this.incrWithTtl(idKey, config.ttlMs),
        this.incrWithTtl(ipKey, config.ttlMs),
      ]);
    } catch {
      this.observability.recordAuthThrottle({
        surface,
        bucket,
        outcome: 'unavailable',
      });
      throw new HttpException(
        AUTH_RATE_LIMIT_MESSAGE,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    if (idCount > config.identityLimit || ipCount > config.ipLimit) {
      this.observability.recordAuthThrottle({
        surface,
        bucket,
        outcome: 'limited',
      });
      throw new HttpException(
        AUTH_RATE_LIMIT_MESSAGE,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    this.observability.recordAuthThrottle({
      surface,
      bucket,
      outcome: 'allowed',
    });
  }

  private async incrWithTtl(key: string, ttlMs: number): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.pexpire(key, ttlMs);
    }
    return count;
  }
}
