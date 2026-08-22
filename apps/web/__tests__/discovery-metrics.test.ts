import { validateDiscoveryMetricsCatalogue } from '@/lib/discovery-metrics/catalogue';
import { isLikelyBotUserAgent } from '@/lib/discovery-metrics/bot-filter';
import { canCollectDiscoveryAnalytics } from '@/lib/discovery-metrics/consent';
import {
  buildDiscoveryEvent,
  isDiscoverableAnalyticsPath,
  validateDiscoveryEvent,
} from '@/lib/discovery-metrics/events';
import {
  classifyDocumentReferrer,
  classifyReferrerHost,
  extractReferrerHost,
} from '@/lib/discovery-metrics/referrers';

describe('discovery metrics catalogue', () => {
  it('validates metric definitions without duplicates', () => {
    expect(validateDiscoveryMetricsCatalogue()).toEqual([]);
  });
});

describe('referrer classification', () => {
  it('classifies organic search hosts', () => {
    expect(classifyReferrerHost('www.google.com')).toBe('organic_search');
    expect(classifyReferrerHost('www.bing.com')).toBe('organic_search');
  });

  it('classifies generative referral hosts with attribution uncertainty', () => {
    expect(classifyReferrerHost('chatgpt.com')).toBe('generative_referral');
    expect(classifyReferrerHost('www.perplexity.ai')).toBe('generative_referral');
  });

  it('extracts hostname only from referrer URLs', () => {
    expect(extractReferrerHost('https://www.google.com/search?q=tamiym')).toBe('www.google.com');
  });

  it('treats same-origin referrers as direct', () => {
    expect(
      classifyDocumentReferrer('https://www.example.test/fundraiser', 'https://www.example.test')
    ).toBe('direct');
  });
});

describe('discovery events', () => {
  it('rejects private analytics paths', () => {
    expect(isDiscoverableAnalyticsPath('/auth/login')).toBe(false);
    expect(buildDiscoveryEvent({ name: 'discovery_page_view', path: '/orders/abc' })).toBeNull();
  });

  it('builds privacy-safe page view events', () => {
    const event = buildDiscoveryEvent({
      name: 'discovery_page_view',
      path: '/fundraiser',
      referrer: 'https://www.google.com/search?q=tamiym',
      userAgent: 'Mozilla/5.0',
    });

    expect(event).not.toBeNull();
    expect(event?.referrerClass).toBe('organic_search');
    expect(event?.referrerHost).toBe('www.google.com');
    expect(validateDiscoveryEvent(event!)).toEqual([]);
  });

  it('filters likely bot user agents', () => {
    expect(isLikelyBotUserAgent('Mozilla/5.0 Googlebot/2.1')).toBe(true);
    expect(isLikelyBotUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X)')).toBe(false);
  });

  it('requires config and consent before collection', () => {
    const original = process.env.NEXT_PUBLIC_DISCOVERY_ANALYTICS_ENABLED;
    process.env.NEXT_PUBLIC_DISCOVERY_ANALYTICS_ENABLED = 'false';
    expect(canCollectDiscoveryAnalytics('granted')).toBe(false);
    process.env.NEXT_PUBLIC_DISCOVERY_ANALYTICS_ENABLED = original;
  });
});
