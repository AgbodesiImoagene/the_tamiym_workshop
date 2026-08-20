import { createHash } from 'crypto';
import { ModerationStatus } from '../generated/prisma/enums';

/** Interim content moderation policy document version (TTW-027). */
export const MODERATION_POLICY_VERSION =
  'content-moderation-policy/v1-interim-2026-08-20';

/** OpenAI omni moderation model id when actorKind is AI. */
export const MODERATION_AI_MODEL_VERSION = 'omni-moderation-latest';

/** Appeal eligibility window from decision.createdAt. */
export const APPEAL_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;

export const APPEAL_STATEMENT_MAX_CHARS = 2000;

export const MODERATION_REASON = {
  AI_APPROVE: 'AI_APPROVE',
  AI_FLAG: 'AI_FLAG',
  AI_REJECT: 'AI_REJECT',
  AI_UNAVAILABLE: 'AI_UNAVAILABLE',
  AI_NO_CONTENT: 'AI_NO_CONTENT',
  ADMIN_APPROVE: 'ADMIN_APPROVE',
  ADMIN_REJECT: 'ADMIN_REJECT',
  ADMIN_FLAG: 'ADMIN_FLAG',
  LEGACY_BACKFILL: 'LEGACY_BACKFILL',
  APPEAL_UPHELD: 'APPEAL_UPHELD',
  APPEAL_OVERTURNED: 'APPEAL_OVERTURNED',
  SYSTEM_RESUBMIT: 'SYSTEM_RESUBMIT',
} as const;

export type ModerationReasonCode =
  (typeof MODERATION_REASON)[keyof typeof MODERATION_REASON];

const CUSTOMER_EXPLANATION: Record<ModerationStatus, string> = {
  [ModerationStatus.APPROVED]:
    'Your content passed moderation and is approved for use under our content policy.',
  [ModerationStatus.REJECTED]:
    'Your content was rejected under our content policy. You may edit and resubmit, or appeal if eligible.',
  [ModerationStatus.FLAGGED]:
    'Your content needs additional human review before it can be approved.',
  [ModerationStatus.PENDING]:
    'Your content is awaiting moderation review. No action is required yet.',
};

/**
 * Customer-safe explanation for an outcome. Never includes AI scores or internal notes.
 */
export function customerExplanationForOutcome(
  outcome: ModerationStatus,
  override?: string | null,
): string {
  const trimmed = override?.trim();
  if (trimmed) return trimmed;
  return CUSTOMER_EXPLANATION[outcome];
}

/**
 * Map an AI ModerationResult-like outcome to stable reason codes.
 */
export function aiReasonCodesForOutcome(
  outcome: ModerationStatus,
  notes?: string | null,
): ModerationReasonCode[] {
  if (outcome === ModerationStatus.APPROVED) {
    return [MODERATION_REASON.AI_APPROVE];
  }
  if (outcome === ModerationStatus.FLAGGED) {
    return [MODERATION_REASON.AI_FLAG];
  }
  if (outcome === ModerationStatus.REJECTED) {
    return [MODERATION_REASON.AI_REJECT];
  }
  const lower = (notes ?? '').toLowerCase();
  if (
    lower.includes('no content') ||
    lower.includes('no screenable') ||
    lower.includes('no url available')
  ) {
    return [MODERATION_REASON.AI_NO_CONTENT];
  }
  return [MODERATION_REASON.AI_UNAVAILABLE];
}

export function adminReasonCodesForOutcome(
  outcome: ModerationStatus,
): ModerationReasonCode[] {
  if (outcome === ModerationStatus.APPROVED) {
    return [MODERATION_REASON.ADMIN_APPROVE];
  }
  if (outcome === ModerationStatus.REJECTED) {
    return [MODERATION_REASON.ADMIN_REJECT];
  }
  if (outcome === ModerationStatus.FLAGGED) {
    return [MODERATION_REASON.ADMIN_FLAG];
  }
  return [MODERATION_REASON.ADMIN_FLAG];
}

/** Stable sha256 hex of JSON-serialisable content for revision binding. */
export function hashRevision(content: unknown): string {
  const payload =
    typeof content === 'string' ? content : JSON.stringify(content ?? null);
  return createHash('sha256').update(payload).digest('hex');
}
