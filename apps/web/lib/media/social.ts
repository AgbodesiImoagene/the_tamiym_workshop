import type { Metadata } from 'next';
import type { PublicFundraiserProduct } from '@/lib/fundraisers';
import { absoluteWebUrl } from '@/lib/site';
import { getDefaultOgAsset } from './registry';

const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

export function resolvePreviewImageUrl(pathOrUrl: string): string {
  const trimmed = pathOrUrl.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return absoluteWebUrl(trimmed.startsWith('/') ? trimmed : `/${trimmed}`);
}

export function pickFundraiserPreviewImage(
  products: readonly PublicFundraiserProduct[]
): string | null {
  for (const product of products) {
    const url = product.design?.thumbnailUrl?.trim();
    if (url) {
      return url;
    }
  }
  return null;
}

export function buildSocialImageFields(previewImageUrl?: string | null): {
  openGraphImages: NonNullable<Metadata['openGraph']>['images'];
  twitterImages: NonNullable<Metadata['twitter']>['images'];
  alt: string;
} {
  const defaultOg = getDefaultOgAsset();
  const useCampaignPreview = Boolean(previewImageUrl?.trim());
  const source = useCampaignPreview ? previewImageUrl!.trim() : defaultOg.path;
  const alt = useCampaignPreview ? 'Approved public campaign merchandise preview' : defaultOg.alt;

  const url = resolvePreviewImageUrl(source);
  const openGraphImages = [
    {
      url,
      width: OG_WIDTH,
      height: OG_HEIGHT,
      alt,
    },
  ];

  return {
    openGraphImages,
    twitterImages: [url],
    alt,
  };
}
