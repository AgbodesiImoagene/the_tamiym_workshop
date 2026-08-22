import type { MetadataRoute } from 'next';
import { listPublicFundraiserSlugs } from '@/lib/fundraisers';
import { absoluteWebUrl } from '@/lib/site';

const STATIC_PATHS = ['/', '/about', '/fundraiser'] as const;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((path) => ({
    url: absoluteWebUrl(path),
    changeFrequency: path === '/' ? 'weekly' : 'monthly',
    priority: path === '/' ? 1 : 0.8,
  }));

  const fundraisers = await listPublicFundraiserSlugs();
  const fundraiserEntries: MetadataRoute.Sitemap = fundraisers.map((entry) => ({
    url: absoluteWebUrl(`/fundraiser/${entry.slug}`),
    lastModified: entry.updatedAt,
    changeFrequency: 'daily',
    priority: 0.7,
  }));

  return [...staticEntries, ...fundraiserEntries];
}
