import {
  buildRobotsRules,
  CATEGORY_DECISIONS,
  CRAWLER_AGENTS,
  PRIVATE_DISALLOW_PREFIXES,
  PUBLIC_ALLOW_PREFIXES,
  validateCrawlerMatrix,
} from '@/lib/crawler-policy/matrix';

describe('crawler policy matrix', () => {
  it('validates agent definitions without duplicates', () => {
    expect(validateCrawlerMatrix()).toEqual([]);
  });

  it('blocks training crawlers from the entire site', () => {
    const rules = buildRobotsRules();
    const ruleList = Array.isArray(rules) ? rules : [rules];

    for (const agent of CRAWLER_AGENTS.filter((a) => a.category === 'ai_training')) {
      const rule = ruleList.find((entry) => entry.userAgent === agent.userAgent);
      expect(rule?.disallow).toEqual(['/']);
    }
  });

  it('allows public marketing paths for search and answer crawlers', () => {
    const rules = buildRobotsRules();
    const ruleList = Array.isArray(rules) ? rules : [rules];
    const googleRule = ruleList.find((entry) => entry.userAgent === 'Googlebot');
    const oaiRule = ruleList.find((entry) => entry.userAgent === 'OAI-SearchBot');

    expect(googleRule?.allow).toEqual(expect.arrayContaining([...PUBLIC_ALLOW_PREFIXES]));
    expect(oaiRule?.allow).toEqual(expect.arrayContaining(['/guides/']));
    expect(googleRule?.disallow).toEqual(expect.arrayContaining([...PRIVATE_DISALLOW_PREFIXES]));
  });

  it('keeps training permission false for all categories in slice 1', () => {
    for (const decision of Object.values(CATEGORY_DECISIONS)) {
      expect(decision.allowTraining).toBe(false);
    }
  });
});
