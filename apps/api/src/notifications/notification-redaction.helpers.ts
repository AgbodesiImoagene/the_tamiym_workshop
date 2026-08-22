/**
 * TTW-043: mask notification recipients for admin APIs and logs.
 */

import { NotificationChannel } from '../generated/prisma/enums';

export function maskEmailRecipient(email: string): string {
  const trimmed = email.trim();
  const at = trimmed.indexOf('@');
  if (at <= 0) return '***';
  const local = trimmed.slice(0, at);
  const domain = trimmed.slice(at + 1);
  const visible = local.slice(0, Math.min(1, local.length));
  return `${visible}***@${domain}`;
}

export function maskPhoneRecipient(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 4) return '***';
  return `${phone.slice(0, Math.min(4, phone.length))}***${digits.slice(-4)}`;
}

export function maskSlackRecipient(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.protocol}//${parsed.hostname}/***`;
  } catch {
    return 'https://***';
  }
}

export function maskNotificationRecipient(
  channel: NotificationChannel,
  recipient: string,
): string {
  switch (channel) {
    case NotificationChannel.EMAIL:
      return maskEmailRecipient(recipient);
    case NotificationChannel.SMS:
      return maskPhoneRecipient(recipient);
    case NotificationChannel.SLACK:
      return maskSlackRecipient(recipient);
    default:
      return '***';
  }
}

export function classifyDeliveryError(message: string): string {
  const lower = message.toLowerCase();
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'provider_timeout';
  }
  if (lower.includes('429') || lower.includes('rate')) {
    return 'provider_rate_limited';
  }
  if (lower.includes('template')) {
    return 'template_error';
  }
  if (lower.includes('webhook') || lower.includes('slack')) {
    return 'webhook_error';
  }
  if (lower.includes('unsupported') || lower.includes('invalid')) {
    return 'configuration_error';
  }
  return 'provider_error';
}

export function redactAttemptErrorMessage(message: string): string {
  return message.slice(0, 240);
}
