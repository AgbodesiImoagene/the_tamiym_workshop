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
      enableReadyCheck: false,
      enableOfflineQueue: false,
      lazyConnect: true,
    });
  }

  async onModuleDestroy(): Promise<void> {
    try {
      if (this.redis.status === 'ready' || this.redis.status === 'connecting') {
        await this.redis.quit();
      } else {
        this.redis.disconnect();
      }
    } catch {
      this.redis.disconnect();
    }
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
    if (this.redis.status !== 'ready') {
      await this.redis.connect();
    }
    // Atomic INCR + PEXPIRE so a crashed/failed expire cannot leave a
    // permanent counter (TTW-023 review).
    const result = await this.redis.eval(
      `
      local count = redis.call('INCR', KEYS[1])
      if count == 1 then
        redis.call('PEXPIRE', KEYS[1], ARGV[1])
      elseif redis.call('PTTL', KEYS[1]) < 0 then
        redis.call('PEXPIRE', KEYS[1], ARGV[1])
      end
      return count
      `,
      1,
      key,
      String(ttlMs),
    );
    return Number(result);
  }
}
