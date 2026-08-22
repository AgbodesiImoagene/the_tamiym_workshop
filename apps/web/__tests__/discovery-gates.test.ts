import { validateAnswerLibrary } from '@/lib/content/answers/registry';
import { validateCrawlerMatrix } from '@/lib/crawler-policy/matrix';
import { validateDiscoveryMetricsCatalogue } from '@/lib/discovery-metrics/catalogue';
import { isDiscoverableAnalyticsPath } from '@/lib/discovery-metrics/events';
import { validateMediaRegistry } from '@/lib/media/registry';
import { noIndexMetadata } from '@/lib/metadata';
import { listIndexableStaticPaths } from '@/lib/content/registry';
import { validateNavTargets, validateRelatedPaths } from '@/lib/public-ia';
import { PRIVATE_DISALLOW_PREFIXES } from '@/lib/crawler-policy/matrix';

describe('discovery regression gates (TTW-078)', () => {
  it('passes all governed registry validators', () => {
    expect(validateAnswerLibrary()).toEqual([]);
    expect(validateCrawlerMatrix()).toEqual([]);
    expect(validateDiscoveryMetricsCatalogue()).toEqual([]);
    expect(validateMediaRegistry()).toEqual([]);
    expect(validateNavTargets()).toEqual([]);
    expect(validateRelatedPaths()).toEqual([]);
  });

  it('keeps private surfaces out of analytics and crawler allow lists', () => {
    for (const prefix of PRIVATE_DISALLOW_PREFIXES) {
      expect(isDiscoverableAnalyticsPath(prefix)).toBe(false);
    }
    expect(listIndexableStaticPaths()).not.toEqual(expect.arrayContaining(['/auth/login']));
  });

  it('marks auth surfaces noindex in metadata helpers', () => {
    const metadata = noIndexMetadata('Account access', '/auth');
    expect(metadata.robots).toEqual(
      expect.objectContaining({ index: false, follow: false, nocache: true })
    );
  });
});
