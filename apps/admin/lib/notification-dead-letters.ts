import { apiClient } from './api';

/** Most dead letters one bulk resend may carry. Mirrors NOTIFICATION_DEAD_LETTER_BATCH_MAX in the API. */
export const DEAD_LETTER_BULK_MAX = 25;

export type DeadLetterChannel = 'EMAIL' | 'SMS' | 'SLACK';
export type DeadLetterAckStatus = 'OPEN' | 'ACKNOWLEDGED';

/** One failed notification. The API already masks the recipient and redacts the error. */
export interface DeadLetterListItem {
  id: string;
  eventName: string;
  channel: DeadLetterChannel;
  recipient: string;
  category: string | null;
  effectKey: string | null;
  generation: number;
  attempts: number;
  lastError: string | null;
  deadLetterAckStatus: DeadLetterAckStatus | null;
  deadLetterAckAt: string | null;
  updatedAt: string;
  createdAt: string;
}

export interface DeadLetterList {
  items: DeadLetterListItem[];
  nextCursor: string | null;
}

export interface DeadLetterAttempt {
  id: string;
  attemptNumber: number;
  outcome: string;
  errorClass: string | null;
  errorMessage: string | null;
  durationMs: number | null;
  startedAt: string;
  finishedAt: string;
}

export interface DeadLetterReplayLink {
  id: string;
  generation: number;
  status: string;
}

export interface DeadLetterDetail extends DeadLetterListItem {
  /** Template variables with sensitive values already redacted by the API. */
  payload: unknown;
  deadLetterAckNote: string | null;
  deliveryAttempts: DeadLetterAttempt[];
  replayedFrom: DeadLetterReplayLink | null;
  replays: DeadLetterReplayLink[];
}

export interface DeadLetterFilters {
  channel?: DeadLetterChannel | '';
  eventName?: string;
  ackStatus?: DeadLetterAckStatus | '';
}

export interface DeadLetterReplayResult {
  replayOutboxId: string;
  generation: number;
  queued: boolean;
}

export type DeadLetterBulkReplayItem =
  | ({ id: string; error?: undefined } & DeadLetterReplayResult)
  | { id: string; error: string };

export function buildDeadLetterQuery(filters: DeadLetterFilters, cursor?: string | null): string {
  const params = new URLSearchParams();
  if (filters.channel) params.set('channel', filters.channel);
  if (filters.eventName?.trim()) params.set('eventName', filters.eventName.trim());
  if (filters.ackStatus) params.set('ackStatus', filters.ackStatus);
  if (cursor) params.set('cursor', cursor);
  const query = params.toString();
  return query ? `?${query}` : '';
}

/**
 * Why "Resend" is unavailable on this failure, or null when it can be resent. The API stays the
 * authority and refuses the same cases; this only explains them before the click.
 */
export function resendBlockedReason(
  detail: Pick<DeadLetterDetail, 'deadLetterAckStatus' | 'effectKey' | 'replays'>
): string | null {
  if (detail.deadLetterAckStatus !== 'ACKNOWLEDGED') {
    return 'Acknowledge this failure first.';
  }
  if (!detail.effectKey) {
    return 'This failure cannot be resent: its effect key is missing.';
  }
  if (detail.replays.length > 0) {
    return 'This failure was already resent. Open its latest generation to resend it again.';
  }
  return null;
}

export async function getAdminDeadLetters(filters: DeadLetterFilters, cursor?: string | null) {
  return apiClient.get<DeadLetterList>(
    `/admin/notification-dead-letters${buildDeadLetterQuery(filters, cursor)}`
  );
}

export async function getAdminDeadLetter(id: string) {
  return apiClient.get<DeadLetterDetail>(`/admin/notification-dead-letters/${id}`);
}

export async function acknowledgeAdminDeadLetter(id: string, note?: string) {
  return apiClient.post<DeadLetterDetail>(`/admin/notification-dead-letters/${id}/acknowledge`, {
    ...(note?.trim() ? { note: note.trim() } : {}),
  });
}

export async function replayAdminDeadLetter(id: string, reason: string) {
  return apiClient.post<DeadLetterReplayResult>(`/admin/notification-dead-letters/${id}/replay`, {
    reason: reason.trim(),
  });
}

export async function replayAdminDeadLettersBulk(ids: string[], reason: string) {
  return apiClient.post<{ results: DeadLetterBulkReplayItem[] }>(
    '/admin/notification-dead-letters/replay/bulk',
    { ids, reason: reason.trim() }
  );
}
