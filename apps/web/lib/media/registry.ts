import { marketingAssets } from '@/lib/assets';
import type { MediaAsset } from './types';

export const OG_DEFAULT_ASSET_ID = 'og-default';

/** Governed public marketing media with alt text and role contracts. */
export const MEDIA_ASSETS: readonly MediaAsset[] = [
  {
    id: OG_DEFAULT_ASSET_ID,
    path: '/assets/marketing/og-default.jpg',
    alt: 'Tamiym Workshop — custom merchandise and fundraising in Nigeria',
    role: 'og-default',
    maxBytes: 250_000,
    width: 1200,
    height: 630,
  },
  {
    id: 'home-hero',
    path: marketingAssets.homeHero,
    alt: 'Custom apparel mockups arranged on a table',
    role: 'hero',
    maxBytes: 8_000_000,
  },
  {
    id: 'fundraiser-hero',
    path: marketingAssets.fundraiserHero,
    alt: 'Community members wearing fundraiser merchandise',
    role: 'hero',
    maxBytes: 8_000_000,
  },
  {
    id: 'fundraiser-detail-fallback',
    path: marketingAssets.fundraiserDetailFallback,
    alt: 'Fundraiser product preview placeholder',
    role: 'content',
    maxBytes: 5_000_000,
  },
  {
    id: 'header-logo',
    path: marketingAssets.headerLogo,
    alt: 'Tamiym Workshop',
    role: 'logo',
    maxBytes: 500_000,
  },
] as const;

export function getMediaAsset(id: string): MediaAsset | undefined {
  return MEDIA_ASSETS.find((asset) => asset.id === id);
}

export function getDefaultOgAsset(): MediaAsset {
  const asset = getMediaAsset(OG_DEFAULT_ASSET_ID);
  if (!asset) {
    throw new Error('Default OG asset is not registered');
  }
  return asset;
}

export function validateMediaRegistry(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const asset of MEDIA_ASSETS) {
    if (ids.has(asset.id)) {
      errors.push(`Duplicate media asset id "${asset.id}"`);
    }
    ids.add(asset.id);

    if (!asset.path.startsWith('/')) {
      errors.push(`Media asset "${asset.id}" path must be site-relative`);
    }
    if (!asset.alt.trim()) {
      errors.push(`Media asset "${asset.id}" is missing alt text`);
    }
    if (asset.role === 'og-default' && (!asset.width || !asset.height)) {
      errors.push(`OG asset "${asset.id}" must declare width and height`);
    }
  }

  const ogDefault = getMediaAsset(OG_DEFAULT_ASSET_ID);
  if (!ogDefault) {
    errors.push('Missing default OG asset registration');
  }

  return errors;
}
