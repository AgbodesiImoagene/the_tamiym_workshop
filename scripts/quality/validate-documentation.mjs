#!/usr/bin/env node
/**
 * Validate documentation integrity under docs/.
 *
 * Checks:
 * - Relative markdown links resolve to existing files
 * - Ticket links in docs/tickets/README.md point to existing ticket files
 * - Ticket backlog State column values are from the approved set
 *
 * Usage:
 *   node scripts/quality/validate-documentation.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';

export const MARKDOWN_LINK_RE = /\[([^\]]*)\]\(([^)]+)\)/g;
export const TICKET_LINK_RE = /\[(TTW-\d{3})\]\(([^)]+\.md)\)/g;
export const ALLOWED_TICKET_STATES = new Set([
  'Complete',
  'Scoped',
  'Deferred',
  'In progress',
]);

function isExternalHref(href) {
  return /^(?:https?:|mailto:|tel:|data:)/i.test(href);
}

export function extractMarkdownLinks(content) {
  const links = [];
  for (const match of content.matchAll(MARKDOWN_LINK_RE)) {
    links.push({
      text: match[1],
      href: match[2].trim(),
      index: match.index ?? 0,
    });
  }
  return links;
}

export function lineNumberAt(content, index) {
  return content.slice(0, index).split('\n').length;
}

export function resolveRelativeLink(fromFile, href, repoRoot = process.cwd()) {
  const trimmed = href.trim();
  if (!trimmed || isExternalHref(trimmed) || trimmed.startsWith('#')) {
    return null;
  }

  const [pathPart] = trimmed.split('#');
  if (!pathPart) {
    return null;
  }

  return resolve(dirname(resolve(repoRoot, fromFile)), pathPart);
}

export function validateMarkdownLinks({
  docsRoot,
  repoRoot = process.cwd(),
  readFile = (filePath) => readFileSync(filePath, 'utf8'),
  fileExists = (filePath) => existsSync(filePath),
} = {}) {
  const resolvedDocsRoot = resolve(repoRoot, docsRoot ?? 'docs');
  const errors = [];

  function walk(directory) {
    for (const entry of readdirSync(directory)) {
      const absolutePath = join(directory, entry);
      if (statSync(absolutePath).isDirectory()) {
        walk(absolutePath);
        continue;
      }
      if (!entry.endsWith('.md')) {
        continue;
      }

      const relativeFile = relative(repoRoot, absolutePath);
      const content = readFile(absolutePath);
      const isTicketBacklog = relativeFile === 'docs/tickets/README.md';
      for (const link of extractMarkdownLinks(content)) {
        if (isTicketBacklog && /^ttw-\d{3}-.+\.md$/i.test(link.href)) {
          continue;
        }
        const target = resolveRelativeLink(relativeFile, link.href, repoRoot);
        if (!target) {
          continue;
        }
        if (!fileExists(target)) {
          errors.push({
            kind: 'broken-link',
            file: relativeFile,
            line: lineNumberAt(content, link.index),
            href: link.href,
            message: `Broken relative link "${link.href}"`,
          });
        }
      }
    }
  }

  walk(resolvedDocsRoot);
  return errors;
}

export function validateTicketLinks({
  ticketsReadmePath = 'docs/tickets/README.md',
  ticketsDir = 'docs/tickets',
  repoRoot = process.cwd(),
  readFile = (filePath) => readFileSync(filePath, 'utf8'),
  fileExists = (filePath) => existsSync(filePath),
} = {}) {
  const readmePath = resolve(repoRoot, ticketsReadmePath);
  const ticketsRoot = resolve(repoRoot, ticketsDir);
  const content = readFile(readmePath);
  const errors = [];

  for (const match of content.matchAll(TICKET_LINK_RE)) {
    const ticketId = match[1];
    const href = match[2].trim();
    const target = resolve(ticketsRoot, href);
    if (!fileExists(target)) {
      errors.push({
        kind: 'missing-ticket',
        file: relative(repoRoot, readmePath),
        line: lineNumberAt(content, match.index ?? 0),
        href,
        ticketId,
        message: `Ticket link ${ticketId} points to missing file "${href}"`,
      });
    }
  }

  return errors;
}

export function parseTicketStateColumn(content) {
  const lines = content.split('\n');
  const errors = [];
  let stateColumnIndex = -1;

  for (let lineNumber = 1; lineNumber <= lines.length; lineNumber += 1) {
    const line = lines[lineNumber - 1];
    if (!line.trim().startsWith('|')) {
      continue;
    }

    const cells = line
      .trim()
      .replace(/^\|/, '')
      .replace(/\|$/, '')
      .split('|')
      .map((cell) => cell.trim());

    if (cells.every((cell) => /^:?-{3,}:?$/.test(cell))) {
      continue;
    }

    const stateIndex = cells.findIndex((cell) => cell === 'State');
    if (stateIndex >= 0) {
      stateColumnIndex = stateIndex;
      continue;
    }

    if (stateColumnIndex < 0 || cells.length <= stateColumnIndex) {
      continue;
    }

    const state = cells[stateColumnIndex];
    if (!ALLOWED_TICKET_STATES.has(state)) {
      errors.push({
        kind: 'invalid-ticket-state',
        line: lineNumber,
        state,
        message: `Unknown ticket state "${state}"`,
      });
    }
  }

  return errors;
}

export function validateTicketStates({
  ticketsReadmePath = 'docs/tickets/README.md',
  repoRoot = process.cwd(),
  readFile = (filePath) => readFileSync(filePath, 'utf8'),
} = {}) {
  const readmePath = resolve(repoRoot, ticketsReadmePath);
  const content = readFile(readmePath);
  return parseTicketStateColumn(content).map((error) => ({
    ...error,
    kind: 'invalid-ticket-state',
    file: relative(repoRoot, readmePath),
  }));
}

export function validateDocumentation(options = {}) {
  const errors = [
    ...validateMarkdownLinks(options),
    ...validateTicketLinks(options),
    ...validateTicketStates(options),
  ];

  return {
    ok: errors.length === 0,
    errors,
  };
}

function formatErrors(errors) {
  return errors
    .map((error) => {
      const location = error.line ? `${error.file}:${error.line}` : error.file;
      return `${location}: ${error.message}`;
    })
    .join('\n');
}

function main() {
  const result = validateDocumentation();
  if (!result.ok) {
    console.error('Documentation validation failed:\n');
    console.error(formatErrors(result.errors));
    process.exit(1);
  }

  console.log('Documentation validation passed.');
}

if (import.meta.url === new URL(process.argv[1], 'file:').href) {
  main();
}
