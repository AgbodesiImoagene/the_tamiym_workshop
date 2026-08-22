/**
 * Minimal schema validation for TTW-070 organic discovery brief frontmatter.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export const DISCOVERY_BRIEF_PATH = 'docs/discovery/ttw-070-organic-discovery-brief.md';

export const REQUIRED_FRONTMATTER_FIELDS = [
  'brief_version',
  'status',
  'document_date',
  'ticket',
  'markets_primary',
  'languages_primary',
  'review_cadence',
];

const FRONTMATTER_RE = /^---\r?\n([\s\S]*?)\r?\n---/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TICKET_RE = /^TTW-\d{3}$/;

export function parseYamlFrontmatter(content) {
  const match = content.match(FRONTMATTER_RE);
  if (!match) {
    return { ok: false, error: 'Missing YAML frontmatter block', fields: {} };
  }

  const fields = {};
  for (const line of match[1].split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }
    const separator = trimmed.indexOf(':');
    if (separator < 0) {
      return { ok: false, error: `Invalid frontmatter line "${trimmed}"`, fields };
    }
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim();
    fields[key] = value;
  }

  return { ok: true, fields };
}

export function validateDiscoveryBriefFields(fields) {
  const errors = [];

  for (const key of REQUIRED_FRONTMATTER_FIELDS) {
    if (!fields[key] || fields[key].length === 0) {
      errors.push(`Missing required frontmatter field "${key}"`);
    }
  }

  if (fields.document_date && !ISO_DATE_RE.test(fields.document_date)) {
    errors.push(`document_date must be ISO YYYY-MM-DD, got "${fields.document_date}"`);
  }

  if (fields.ticket && !TICKET_RE.test(fields.ticket)) {
    errors.push(`ticket must match TTW-XXX, got "${fields.ticket}"`);
  }

  if (fields.ticket && fields.ticket !== 'TTW-070') {
    errors.push(`ticket must be TTW-070 for the organic discovery brief, got "${fields.ticket}"`);
  }

  if (fields.brief_version && !/^discovery-strategy\//.test(fields.brief_version)) {
    errors.push(
      `brief_version must start with "discovery-strategy/", got "${fields.brief_version}"`
    );
  }

  return errors;
}

export function validateDiscoveryBrief({
  briefPath = DISCOVERY_BRIEF_PATH,
  repoRoot = process.cwd(),
  readFile = (filePath) => readFileSync(filePath, 'utf8'),
  fileExists = (filePath) => existsSync(filePath),
} = {}) {
  const absolutePath = resolve(repoRoot, briefPath);
  if (!fileExists(absolutePath)) {
    return [
      {
        kind: 'missing-discovery-brief',
        file: briefPath,
        message: `Missing discovery brief at ${briefPath}`,
      },
    ];
  }

  const content = readFile(absolutePath);
  const parsed = parseYamlFrontmatter(content);
  if (!parsed.ok) {
    return [
      {
        kind: 'invalid-discovery-brief-frontmatter',
        file: briefPath,
        message: parsed.error,
      },
    ];
  }

  return validateDiscoveryBriefFields(parsed.fields).map((message) => ({
    kind: 'invalid-discovery-brief-frontmatter',
    file: briefPath,
    message,
  }));
}
