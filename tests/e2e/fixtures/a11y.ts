import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AxeResults } from 'axe-core';

const exceptionsPath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../accessibility/exceptions.json'
);

type A11yException = {
  rule_id: string;
  page: string;
  owner: string;
  rationale: string;
  expires_on: string;
  follow_up_ticket: string;
};

type ExceptionsFile = {
  policy_version: string;
  exceptions: A11yException[];
};

let cached: ExceptionsFile | null = null;

export function loadA11yExceptions(): ExceptionsFile {
  if (!cached) {
    cached = JSON.parse(readFileSync(exceptionsPath, 'utf8')) as ExceptionsFile;
  }
  return cached;
}

const IMPACT_ORDER = ['minor', 'moderate', 'serious', 'critical'] as const;

export function isApprovedException(violationId: string, pagePath: string): boolean {
  const { exceptions } = loadA11yExceptions();
  const today = new Date().toISOString().slice(0, 10);
  return exceptions.some(
    (entry) => entry.rule_id === violationId && entry.page === pagePath && entry.expires_on >= today
  );
}

/**
 * Returns unapproved critical/serious violations after applying governed exceptions.
 */
export function filterBlockingViolations(
  results: AxeResults,
  pagePath: string
): AxeResults['violations'] {
  return results.violations.filter((violation) => {
    const impact = violation.impact ?? 'minor';
    if (!IMPACT_ORDER.includes(impact as (typeof IMPACT_ORDER)[number])) {
      return false;
    }
    if (impact !== 'critical' && impact !== 'serious') {
      return false;
    }
    return !isApprovedException(violation.id, pagePath);
  });
}
