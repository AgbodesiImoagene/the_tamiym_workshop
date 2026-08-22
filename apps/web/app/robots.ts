import type { MetadataRoute } from 'next';
import { absoluteWebUrl } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/about', '/fundraiser', '/solutions/bulk'],
      disallow: ['/auth/', '/orders/', '/verify-email', '/policies/'],
    },
    sitemap: absoluteWebUrl('/sitemap.xml'),
  };
}
