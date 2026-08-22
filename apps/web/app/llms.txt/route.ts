import { listIndexableStaticPaths } from '@/lib/content/registry';
import {
  CATEGORY_DECISIONS,
  CRAWLER_AGENTS,
  PRIVATE_DISALLOW_PREFIXES,
} from '@/lib/crawler-policy/matrix';
import { absoluteWebUrl } from '@/lib/site';

export const dynamic = 'force-static';

export function GET() {
  const lines = [
    '# Tamiym Workshop',
    '> Nigeria-first custom merchandise and fundraising platform (en-NG).',
    '',
    '## Crawler policy (interim)',
    '- Training crawlers (GPTBot, Google-Extended, CCBot, anthropic-ai, ClaudeBot): disallowed via robots.txt.',
    '- Search and answer-oriented crawlers: same public marketing HTML as human visitors; no hidden copy.',
    `- Private paths never crawled: ${PRIVATE_DISALLOW_PREFIXES.join(', ')}`,
    '',
    '## Public pages',
    ...listIndexableStaticPaths().map((path) => `- ${absoluteWebUrl(path)}`),
    '',
    '## Documented agents',
    ...CRAWLER_AGENTS.map(
      (agent) =>
        `- ${agent.userAgent} (${agent.category}; reviewed ${agent.sourceReviewedAt})`,
    ),
    '',
    '## Category decisions',
    ...Object.values(CATEGORY_DECISIONS).map(
      (decision) => `- ${decision.category}: ${decision.notes}`,
    ),
    '',
    'Full policy: docs/discovery/ttw-075-interim-policy.md',
  ];

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
