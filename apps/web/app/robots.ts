import type { MetadataRoute } from 'next';
import { buildRobotsRules } from '@/lib/crawler-policy/matrix';
import { absoluteWebUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: buildRobotsRules(),
    sitemap: absoluteWebUrl('/sitemap.xml'),
  };
}
