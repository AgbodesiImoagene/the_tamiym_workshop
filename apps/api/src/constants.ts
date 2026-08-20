/**
 * Application-wide constants. Extract env-driven values via ConfigService where needed.
 */

import { CurrencyCode } from './generated/prisma/enums';

/** Default store currency (v1: Nigeria-only). Move to config/customer/session when multi-currency. */
export const DEFAULT_CURRENCY = CurrencyCode.NGN;

/** Variant generation limits to prevent combinatorial explosions. */
export const MAX_VARIANTS_PER_PRODUCT = 1000;
export const MAX_OPTIONS_PER_PRODUCT = 5;

/** Mail queue (BullMQ) name and job types */
export const MAIL_QUEUE_NAME = 'mail';
export const JOB_VERIFICATION_EMAIL = 'verification-email';
export const JOB_PASSWORD_RESET_EMAIL = 'password-reset-email';
export const JOB_NOTIFICATION_OUTBOX = 'notification-outbox';

/** Payout execution queue (BullMQ) */
export const PAYOUT_QUEUE_NAME = 'payout-execution';
export const JOB_EXECUTE_PAYOUT_RUN = 'execute-payout-run';

/** Token TTLs in milliseconds */
export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Auth cookies (TTW-020: surface-scoped).
 *
 * Legacy shared names are kept ONLY so we can clear them from browsers that
 * still hold pre-cutover cookies. Never set these names; new sessions must use
 * the surface-scoped names below. See docs/14-auth-and-session-architecture.md.
 */
export const ACCESS_TOKEN_COOKIE_NAME = 'access_token';
export const ACCESS_TOKEN_COOKIE_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';
export const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Customer surface cookies (apps/app, apps/web). */
export const CUSTOMER_ACCESS_COOKIE_NAME = 'ttw_customer_access';
export const CUSTOMER_REFRESH_COOKIE_NAME = 'ttw_customer_refresh';
/** Readable (non-httpOnly) double-submit CSRF cookie for the customer surface. */
export const CUSTOMER_CSRF_COOKIE_NAME = 'ttw_customer_csrf';

/** Admin surface cookies (apps/admin). */
export const ADMIN_ACCESS_COOKIE_NAME = 'ttw_admin_access';
export const ADMIN_REFRESH_COOKIE_NAME = 'ttw_admin_refresh';
/** Readable (non-httpOnly) double-submit CSRF cookie for the admin surface. */
export const ADMIN_CSRF_COOKIE_NAME = 'ttw_admin_csrf';

/** Header a client must echo the surface CSRF cookie value in on mutating requests. */
export const CSRF_HEADER_NAME = 'x-csrf-token';

/** Google OAuth (CSRF state + post-login path); short-lived */
export const GOOGLE_OAUTH_STATE_COOKIE_NAME = 'google_oauth_state';
export const GOOGLE_OAUTH_NEXT_COOKIE_NAME = 'google_oauth_next';
export const GOOGLE_OAUTH_COOKIE_MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes

/** Rate limiting (legacy Nest Throttler defaults for non-auth routes). */
export const THROTTLE_LIMIT = 3;
export const THROTTLE_TTL_MS = 60_000; // 1 minute

/**
 * Redis-backed auth abuse buckets (TTW-023). Deny if either the identity or
 * IP counter for the bucket exceeds its limit within the TTL window.
 */
export const AUTH_RATE_LIMIT_MESSAGE =
  'Too many requests. Try again later.' as const;

export const AUTH_RATE_LIMIT_BUCKETS = {
  customer_auth: {
    identityLimit: 5,
    ipLimit: 40,
    ttlMs: 60_000,
  },
  admin_login: {
    identityLimit: 5,
    ipLimit: 40,
    ttlMs: 60_000,
  },
  admin_mfa: {
    identityLimit: 5,
    ipLimit: 30,
    ttlMs: 5 * 60_000,
  },
  admin_recovery: {
    identityLimit: 3,
    ipLimit: 20,
    ttlMs: 15 * 60_000,
  },
  password_reset: {
    identityLimit: 5,
    ipLimit: 40,
    ttlMs: 60_000,
  },
} as const;

export type AuthRateLimitBucket = keyof typeof AUTH_RATE_LIMIT_BUCKETS;

/** Pending order expiry: release reserved inventory after this many minutes if unpaid. */
export const ORDER_PENDING_EXPIRY_MINUTES = 30;

/** Admin custom email broadcast: throttle per admin (Nest Throttler, default bucket). */
export const ADMIN_EMAIL_BROADCAST_THROTTLE_LIMIT = 5;
export const ADMIN_EMAIL_BROADCAST_THROTTLE_TTL_MS = 60 * 60 * 1000; // 1 hour
