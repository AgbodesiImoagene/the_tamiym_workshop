import {
  AUTH_RATE_LIMIT_BUCKETS,
  type AuthRateLimitBucket,
} from '../constants';

export const AUTH_RATE_LIMIT_KEY_PREFIX = 'ttw:auth:rl';

/** Reflect metadata key for `@AuthRateLimit(bucket)`. */
export const AUTH_RATE_LIMIT_BUCKET_KEY = 'auth_rate_limit_bucket';

/** Normalize emails for identity throttle keys (case/whitespace). */
export function normalizeAuthThrottleIdentity(
  email: string | null | undefined,
): string {
  if (!email || typeof email !== 'string') {
    return 'anon';
  }
  const normalized = email.trim().toLowerCase();
  return normalized.length > 0 ? normalized : 'anon';
}

/** Trusted client IP from Express (`trust proxy = 1`). */
export function resolveAuthThrottleIp(ip: string | null | undefined): string {
  if (!ip || typeof ip !== 'string') {
    return 'unknown';
  }
  const trimmed = ip.trim();
  return trimmed.length > 0 ? trimmed : 'unknown';
}

export function authRateLimitIdentityKey(
  bucket: AuthRateLimitBucket,
  identity: string,
): string {
  return `${AUTH_RATE_LIMIT_KEY_PREFIX}:id:${bucket}:${identity}`;
}

export function authRateLimitIpKey(
  bucket: AuthRateLimitBucket,
  ip: string,
): string {
  return `${AUTH_RATE_LIMIT_KEY_PREFIX}:ip:${bucket}:${ip}`;
}

export function authRateLimitConfig(bucket: AuthRateLimitBucket) {
  return AUTH_RATE_LIMIT_BUCKETS[bucket];
}
