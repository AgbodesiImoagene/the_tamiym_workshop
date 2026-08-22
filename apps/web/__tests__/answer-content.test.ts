import { getAnswersForPath, validateAnswerLibrary } from '@/lib/content/answers/registry';
import { buildFaqPageJsonLd } from '@/lib/structured-data/builders';

describe('answer content library', () => {
  const originalWebUrl = process.env.NEXT_PUBLIC_WEB_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_WEB_URL = 'https://www.example.test';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_WEB_URL = originalWebUrl;
  });

  it('validates the answer registry without blocked superlatives', () => {
    expect(validateAnswerLibrary()).toEqual([]);
  });

  it('returns fundraiser answers for the fundraising landing page', () => {
    const answers = getAnswersForPath('/fundraiser');
    expect(answers.length).toBeGreaterThanOrEqual(4);
    expect(answers.every((answer) => answer.canonicalPath === '/fundraiser')).toBe(true);
  });

  it('builds FAQ JSON-LD that matches visible answer text', () => {
    const answers = getAnswersForPath('/fundraiser');
    const faq = buildFaqPageJsonLd(answers, '/fundraiser');
    expect(faq?.['@type']).toBe('FAQPage');
    expect(faq?.mainEntity).toHaveLength(answers.length);
  });
});
