import type { ConfigService } from '@nestjs/config';
import { ModerationStatus } from '../generated/prisma/enums';
import type { ModerationResult } from './moderation.types';

/** Setting that turns the AI screening of designs and campaigns on (TTW-252). */
export const AI_SCREENING_ENV_KEY = 'AI_SCREENING_ENABLED';

/** Note stored with the decision recorded while the screening is off. */
export const AI_SCREENING_OFF_NOTES = 'AI screening is turned off';

/**
 * Whether designs and campaigns are sent to the AI for screening. Off unless the
 * setting is `true` or `1`: a missing or misspelt value keeps the content on its
 * way to an admin and sends nothing to the AI.
 *
 * Uploaded images are not affected: their screening has its own path.
 */
export function isAiScreeningEnabled(config: Pick<ConfigService, 'get'>) {
  const raw = config.get<string>(AI_SCREENING_ENV_KEY);
  const value = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  return value === 'true' || value === '1';
}

/**
 * What the screening answers while it is off: the same result as an unavailable AI
 * (PENDING, no score), so the item waits for an admin.
 */
export function aiScreeningOffResult(): ModerationResult {
  return {
    status: ModerationStatus.PENDING,
    notes: AI_SCREENING_OFF_NOTES,
    maxScore: 0,
  };
}
