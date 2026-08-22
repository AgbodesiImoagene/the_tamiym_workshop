/**
 * TTW-043: signed unsubscribe tokens (HMAC, scoped, expiring).
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import {
  NotificationCategory,
  NotificationPreferenceChannel,
} from '../generated/prisma/enums';

export const NOTIFICATION_UNSUBSCRIBE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export type NotificationUnsubscribePayload = {
  userId: string;
  category: NotificationCategory;
  channel: NotificationPreferenceChannel;
  exp: number;
};

function base64UrlEncode(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url').replace(/=+$/g, '');
}

function base64UrlDecode(value: string): string {
  return Buffer.from(value, 'base64url').toString('utf8');
}

export function signNotificationUnsubscribeToken(
  payload: NotificationUnsubscribePayload,
  secret: string,
): string {
  const body = base64UrlEncode(JSON.stringify(payload));
  const sig = createHmac('sha256', secret).update(body).digest('base64url');
  return `${body}.${sig}`;
}

export function verifyNotificationUnsubscribeToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): NotificationUnsubscribePayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [body, sig] = parts;
  const expected = createHmac('sha256', secret)
    .update(body)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expectedBuf = Buffer.from(expected);
  if (
    sigBuf.length !== expectedBuf.length ||
    !timingSafeEqual(sigBuf, expectedBuf)
  ) {
    return null;
  }

  let parsed: NotificationUnsubscribePayload;
  try {
    parsed = JSON.parse(
      base64UrlDecode(body),
    ) as NotificationUnsubscribePayload;
  } catch {
    return null;
  }

  if (
    !parsed?.userId ||
    !parsed.category ||
    !parsed.channel ||
    typeof parsed.exp !== 'number'
  ) {
    return null;
  }
  if (parsed.exp < nowMs) {
    return null;
  }
  return parsed;
}
