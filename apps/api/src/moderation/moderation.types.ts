import { ModerationStatus } from '../generated/prisma/enums';

/**
 * Input to the moderation service. Supply either text or an image URL (or both).
 * At least one must be provided.
 */
export interface ModerationInput {
  /** Free-text to screen (e.g. campaign title + description + story). */
  text?: string;
  /** Publicly accessible URL of an image to screen. */
  imageUrl?: string;
}

/**
 * Outcome of an AI moderation check.
 *
 * status:
 *  - APPROVED: AI confidence below approve threshold — safe to proceed.
 *  - FLAGGED:  AI confidence in the ambiguous band — route to the human review queue.
 *  - REJECTED: AI confidence above reject threshold — auto-reject, notify user.
 *  - PENDING:  AI not configured or call failed — falls back to human review queue.
 *
 * notes: human-readable summary of the highest-scoring categories (internal use only).
 * maxScore: the highest per-category score returned by the AI (0–1).
 */
export interface ModerationResult {
  status: ModerationStatus;
  notes: string;
  maxScore: number;
}

/**
 * Per-category scores returned by the OpenAI Moderation API.
 * Subset of categories we track; others are discarded.
 */
export interface ModerationCategoryScores {
  harassment?: number;
  'harassment/threatening'?: number;
  hate?: number;
  'hate/threatening'?: number;
  'self-harm'?: number;
  'self-harm/intent'?: number;
  'self-harm/instructions'?: number;
  sexual?: number;
  'sexual/minors'?: number;
  violence?: number;
  'violence/graphic'?: number;
  illicit?: number;
  'illicit/violent'?: number;
  [key: string]: number | undefined;
}
