import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  ALLOWED_TICKET_STATES,
  extractMarkdownLinks,
  parseTicketStateColumn,
  resolveRelativeLink,
  validateDocumentation,
  validateMarkdownLinks,
  validateTicketLinks,
  validateTicketStates,
} from '../validate-documentation.mjs';
import {
  DISCOVERY_BRIEF_PATH,
  parseYamlFrontmatter,
  validateDiscoveryBrief,
  validateDiscoveryBriefFields,
} from '../discovery-brief-schema.mjs';

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), 'ttw-docs-validate-'));
  const docsRoot = join(root, 'docs');
  const ticketsDir = join(docsRoot, 'tickets');

  mkdirSync(ticketsDir, { recursive: true });
  writeFileSync(join(docsRoot, 'valid.md'), 'See [ticket](tickets/ttw-001.md).\n');
  writeFileSync(join(docsRoot, 'broken.md'), 'See [missing](missing.md).\n');
  writeFileSync(join(ticketsDir, 'ttw-001.md'), '# TTW-001\n');
  writeFileSync(
    join(ticketsDir, 'README.md'),
    [
      '| Ticket | State |',
      '| ------ | ----- |',
      '| [TTW-001](ttw-001.md) | Complete |',
      '| [TTW-999](ttw-999-missing.md) | Scoped |',
      '| [TTW-002](ttw-002.md) | Unknown |',
      '',
    ].join('\n')
  );
  writeFileSync(join(ticketsDir, 'ttw-002.md'), '# TTW-002\n');

  return root;
}

test('extractMarkdownLinks returns href metadata', () => {
  const links = extractMarkdownLinks('Read [guide](../guide.md) and [site](https://example.com).');
  assert.equal(links.length, 2);
  assert.equal(links[0].href, '../guide.md');
  assert.equal(links[1].href, 'https://example.com');
});

test('resolveRelativeLink ignores external and anchor-only hrefs', () => {
  assert.equal(resolveRelativeLink('docs/a.md', 'https://example.com'), null);
  assert.equal(resolveRelativeLink('docs/a.md', '#section'), null);
});

test('validateMarkdownLinks reports missing relative targets with file and line', () => {
  const root = createFixture();
  try {
    const errors = validateMarkdownLinks({ docsRoot: 'docs', repoRoot: root });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].file, 'docs/broken.md');
    assert.equal(errors[0].line, 1);
    assert.match(errors[0].message, /missing\.md/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validateTicketLinks reports missing ticket files', () => {
  const root = createFixture();
  try {
    const errors = validateTicketLinks({ repoRoot: root });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].ticketId, 'TTW-999');
    assert.equal(errors[0].href, 'ttw-999-missing.md');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validateTicketStates rejects unknown backlog states', () => {
  const root = createFixture();
  try {
    const errors = validateTicketStates({ repoRoot: root });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].state, 'Unknown');
    assert.equal(errors[0].line, 5);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('parseTicketStateColumn accepts the approved state set', () => {
  for (const state of ALLOWED_TICKET_STATES) {
    const errors = parseTicketStateColumn(
      `| Ticket | State |\n| --- | --- |\n| TTW-001 | ${state} |`
    );
    assert.deepEqual(errors, []);
  }
});

test('validateDocumentation aggregates all documentation failures', () => {
  const root = createFixture();
  try {
    const result = validateDocumentation({ repoRoot: root });
    assert.equal(result.ok, false);
    assert.equal(result.errors.length, 4);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('parseYamlFrontmatter extracts key/value pairs', () => {
  const parsed = parseYamlFrontmatter(
    '---\nbrief_version: discovery-strategy/v1\nticket: TTW-070\n---\n# Body'
  );
  assert.equal(parsed.ok, true);
  assert.equal(parsed.fields.ticket, 'TTW-070');
});

test('validateDiscoveryBriefFields rejects missing required keys', () => {
  const errors = validateDiscoveryBriefFields({ ticket: 'TTW-070' });
  assert.ok(errors.some((message) => message.includes('brief_version')));
});

test('validateDiscoveryBrief reports missing brief file', () => {
  const root = mkdtempSync(join(tmpdir(), 'ttw-discovery-brief-'));
  try {
    const errors = validateDiscoveryBrief({ repoRoot: root });
    assert.equal(errors.length, 1);
    assert.equal(errors[0].kind, 'missing-discovery-brief');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('validateDiscoveryBrief accepts the committed brief frontmatter', () => {
  const repoRoot = join(import.meta.dirname, '../../..');
  const errors = validateDiscoveryBrief({ repoRoot, briefPath: DISCOVERY_BRIEF_PATH });
  assert.deepEqual(errors, []);
});
