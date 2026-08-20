import { SetMetadata } from '@nestjs/common';
import type { AuthRateLimitBucket } from '../../constants';
import { AUTH_RATE_LIMIT_BUCKET_KEY } from '../auth-rate-limit';

/** Attach an auth abuse bucket to a route (TTW-023 Redis identity+IP limits). */
export const AuthRateLimit = (bucket: AuthRateLimitBucket) =>
  SetMetadata(AUTH_RATE_LIMIT_BUCKET_KEY, bucket);
