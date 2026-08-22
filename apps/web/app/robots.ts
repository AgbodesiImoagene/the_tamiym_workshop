import type { MetadataRoute } from 'next';
import { absoluteWebUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/about', '/fundraiser'],
      disallow: ['/auth/', '/orders/', '/verify-email'],
    },
    sitemap: absoluteWebUrl('/sitemap.xml'),
  };
}
