import type { CrawlerAgentDefinition, CrawlerPolicyDecision } from './types';

/** Public marketing prefixes indexable via TTW-071/072. */
export const PUBLIC_ALLOW_PREFIXES = [
  '/',
  '/about',
  '/fundraiser',
  '/solutions/bulk',
  '/guides/',
] as const;

/** Paths that must never be crawled regardless of agent category. */
export const PRIVATE_DISALLOW_PREFIXES = [
  '/auth/',
  '/orders/',
  '/verify-email',
  '/policies/',
] as const;

export const CATEGORY_DECISIONS: Record<CrawlerAgentDefinition['category'], CrawlerPolicyDecision> =
  {
    conventional_search: {
      category: 'conventional_search',
      allowPublicDiscovery: true,
      allowTraining: false,
      owner: 'Product/Marketing',
      notes: 'Standard search indexing for public marketing pages only.',
    },
    ai_search: {
      category: 'ai_search',
      allowPublicDiscovery: true,
      allowTraining: false,
      owner: 'Product/Marketing',
      notes:
        'Answer/search-oriented agents may fetch the same public HTML as conventional crawlers.',
    },
    ai_training: {
      category: 'ai_training',
      allowPublicDiscovery: false,
      allowTraining: false,
      owner: 'Legal',
      notes: 'Model-training crawlers are disallowed until explicit content licensing approval.',
    },
    default: {
      category: 'default',
      allowPublicDiscovery: true,
      allowTraining: false,
      owner: 'Engineering',
      notes:
        'Unlisted agents receive public marketing allow rules; training not granted by default.',
    },
  };

/** Documented agents with dated primary sources (slice 1). */
export const CRAWLER_AGENTS: readonly CrawlerAgentDefinition[] = [
  {
    userAgent: 'Googlebot',
    category: 'conventional_search',
    sourceUrl:
      'https://developers.google.com/search/docs/crawling-indexing/overview-google-crawlers',
    sourceReviewedAt: '2026-08-22',
  },
  {
    userAgent: 'Bingbot',
    category: 'conventional_search',
    sourceUrl: 'https://www.bing.com/webmasters/help/which-crawlers-does-bing-use-8c184ec0',
    sourceReviewedAt: '2026-08-22',
  },
  {
    userAgent: 'OAI-SearchBot',
    category: 'ai_search',
    sourceUrl: 'https://platform.openai.com/docs/bots',
    sourceReviewedAt: '2026-08-22',
  },
  {
    userAgent: 'ChatGPT-User',
    category: 'ai_search',
    sourceUrl: 'https://platform.openai.com/docs/bots',
    sourceReviewedAt: '2026-08-22',
  },
  {
    userAgent: 'PerplexityBot',
    category: 'ai_search',
    sourceUrl: 'https://docs.perplexity.ai/guides/perplexitybot',
    sourceReviewedAt: '2026-08-22',
  },
  {
    userAgent: 'GPTBot',
    category: 'ai_training',
    sourceUrl: 'https://platform.openai.com/docs/bots',
    sourceReviewedAt: '2026-08-22',
  },
  {
    userAgent: 'Google-Extended',
    category: 'ai_training',
    sourceUrl: 'https://developers.google.com/search/docs/crawling-indexing/google-common-crawlers',
    sourceReviewedAt: '2026-08-22',
  },
  {
    userAgent: 'CCBot',
    category: 'ai_training',
    sourceUrl: 'https://commoncrawl.org/ccbot',
    sourceReviewedAt: '2026-08-22',
  },
  {
    userAgent: 'anthropic-ai',
    category: 'ai_training',
    sourceUrl:
      'https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web',
    sourceReviewedAt: '2026-08-22',
  },
  {
    userAgent: 'ClaudeBot',
    category: 'ai_training',
    sourceUrl:
      'https://support.anthropic.com/en/articles/8896518-does-anthropic-crawl-data-from-the-web',
    sourceReviewedAt: '2026-08-22',
  },
] as const;

type RobotsRule = {
  userAgent: string | string[];
  allow?: string | string[];
  disallow?: string | string[];
};

function publicDiscoveryRule(userAgent: string): RobotsRule {
  return {
    userAgent,
    allow: [...PUBLIC_ALLOW_PREFIXES],
    disallow: [...PRIVATE_DISALLOW_PREFIXES],
  };
}

function trainingBlockRule(userAgent: string): RobotsRule {
  return {
    userAgent,
    disallow: ['/'],
  };
}

export function buildRobotsRules(): RobotsRule[] {
  const rules: RobotsRule[] = [];

  for (const agent of CRAWLER_AGENTS) {
    const decision = CATEGORY_DECISIONS[agent.category];
    if (decision.allowPublicDiscovery) {
      rules.push(publicDiscoveryRule(agent.userAgent));
    } else {
      rules.push(trainingBlockRule(agent.userAgent));
    }
  }

  rules.push(publicDiscoveryRule('*'));
  return rules;
}

export function validateCrawlerMatrix(): string[] {
  const errors: string[] = [];
  const seen = new Set<string>();

  for (const agent of CRAWLER_AGENTS) {
    if (seen.has(agent.userAgent)) {
      errors.push(`Duplicate crawler user-agent "${agent.userAgent}"`);
    }
    seen.add(agent.userAgent);

    if (!agent.sourceUrl.startsWith('https://')) {
      errors.push(`Agent "${agent.userAgent}" missing https source URL`);
    }
  }

  for (const prefix of PRIVATE_DISALLOW_PREFIXES) {
    if (PUBLIC_ALLOW_PREFIXES.includes(prefix as (typeof PUBLIC_ALLOW_PREFIXES)[number])) {
      errors.push(`Private prefix "${prefix}" must not appear in public allow list`);
    }
  }

  return errors;
}
