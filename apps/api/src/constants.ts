/**
 * Application-wide constants. Extract env-driven values via ConfigService where needed.
 */

/** Mail queue (BullMQ) name and job types */
export const MAIL_QUEUE_NAME = 'mail';
export const JOB_VERIFICATION_EMAIL = 'verification-email';
export const JOB_PASSWORD_RESET_EMAIL = 'password-reset-email';

/** Token TTLs in milliseconds */
export const VERIFICATION_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
export const PASSWORD_RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour
export const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Auth cookies */
export const ACCESS_TOKEN_COOKIE_NAME = 'access_token';
export const ACCESS_TOKEN_COOKIE_MAX_AGE_MS = 15 * 60 * 1000; // 15 minutes
export const REFRESH_TOKEN_COOKIE_NAME = 'refresh_token';
export const REFRESH_TOKEN_COOKIE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Rate limiting (e.g. resend verification, forgot password) */
export const THROTTLE_LIMIT = 3;
export const THROTTLE_TTL_MS = 60_000; // 1 minute
