import { BULK_ANSWERS } from './bulk';
import { FUNDRAISER_ANSWERS } from './fundraiser';
import type { AnswerEntry } from './types';

const ALL_ANSWERS: readonly AnswerEntry[] = [...FUNDRAISER_ANSWERS, ...BULK_ANSWERS];

const BLOCKED_SUPERLATIVES = [/risk[- ]free/i, /\bno upfront costs\b/i, /\bguaranteed ranking\b/i];

export function listAllAnswers(): readonly AnswerEntry[] {
  return ALL_ANSWERS;
}

export function getAnswersForPath(path: string): AnswerEntry[] {
  return ALL_ANSWERS.filter((answer) => answer.canonicalPath === path);
}

export function validateAnswerLibrary(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const answer of ALL_ANSWERS) {
    if (ids.has(answer.id)) {
      errors.push(`Duplicate answer id "${answer.id}"`);
    }
    ids.add(answer.id);

    if (!answer.directAnswer.trim()) {
      errors.push(`Answer "${answer.id}" is missing directAnswer`);
    }
    if (!answer.evidence.source || !answer.evidence.reviewedAt) {
      errors.push(`Answer "${answer.id}" is missing evidence metadata`);
    }

    const combined = [answer.directAnswer, ...(answer.details ?? [])].join(' ');
    for (const pattern of BLOCKED_SUPERLATIVES) {
      if (pattern.test(combined)) {
        errors.push(`Answer "${answer.id}" contains blocked superlative: ${pattern}`);
      }
    }
  }

  return errors;
}
