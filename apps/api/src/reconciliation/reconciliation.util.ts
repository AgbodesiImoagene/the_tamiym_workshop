import { createHash } from 'node:crypto';
import {
  ReconciliationDomain,
  ReconciliationOutcome,
  ReconciliationSeverity,
} from '../generated/prisma/enums';

export type FindingDraft = {
  domain: ReconciliationDomain;
  outcome: ReconciliationOutcome;
  severity: ReconciliationSeverity;
  fingerprint: string;
  leftLabel: string;
  leftValue: string;
  rightLabel: string;
  rightValue: string;
  currency?: string;
  unit?: string;
  sourceIds?: Record<string, string>;
  evidence?: Record<string, unknown>;
};

export function fingerprintFinding(parts: {
  domain: ReconciliationDomain;
  outcome: ReconciliationOutcome;
  entityKey: string;
}): string {
  return createHash('sha256')
    .update(`${parts.domain}|${parts.outcome}|${parts.entityKey}`)
    .digest('hex')
    .slice(0, 32);
}

export function windowKeyFor(
  kind: 'internal' | 'provider' | 'targeted',
  dayIso: string,
  suffix = '',
): string {
  return suffix ? `${kind}:${dayIso}:${suffix}` : `${kind}:${dayIso}`;
}

export function lagosDayIso(date: Date): string {
  // Africa/Lagos is UTC+1 without DST.
  const lagos = new Date(date.getTime() + 60 * 60 * 1000);
  return lagos.toISOString().slice(0, 10);
}

export function escapeCsvCell(value: string): string {
  const sanitized = value.replace(/^[=+\-@]/, "'$&");
  if (/[",\n]/.test(sanitized)) {
    return `"${sanitized.replace(/"/g, '""')}"`;
  }
  return sanitized;
}
