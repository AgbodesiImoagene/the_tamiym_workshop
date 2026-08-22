import { validateMediaRegistry } from '@/lib/media/registry';
import {
  buildSocialImageFields,
  pickFundraiserPreviewImage,
  resolvePreviewImageUrl,
} from '@/lib/media/social';

describe('media registry', () => {
  it('validates governed assets without errors', () => {
    expect(validateMediaRegistry()).toEqual([]);
  });
});

describe('social preview helpers', () => {
  const originalWebUrl = process.env.NEXT_PUBLIC_WEB_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_WEB_URL = 'https://www.example.test';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_WEB_URL = originalWebUrl;
  });

  it('resolves site-relative preview paths to absolute URLs', () => {
    expect(resolvePreviewImageUrl('/assets/marketing/og-default.jpg')).toBe(
      'https://www.example.test/assets/marketing/og-default.jpg'
    );
  });

  it('passes through absolute preview URLs', () => {
    expect(resolvePreviewImageUrl('https://cdn.example.test/preview.jpg')).toBe(
      'https://cdn.example.test/preview.jpg'
    );
  });

  it('emits default OG images when no campaign preview exists', () => {
    const social = buildSocialImageFields();
    expect(social.openGraphImages?.[0]?.url).toBe(
      'https://www.example.test/assets/marketing/og-default.jpg'
    );
    expect(social.twitterImages?.[0]).toBe(
      'https://www.example.test/assets/marketing/og-default.jpg'
    );
  });

  it('prefers the first approved campaign thumbnail for fundraiser previews', () => {
    const preview = pickFundraiserPreviewImage([
      {
        campaignProductId: 'cp-1',
        productId: 'p-1',
        product: { id: 'p-1', name: 'Tee', slug: 'tee' },
        design: { id: 'd-1', name: 'Crest', thumbnailUrl: null },
        baseAmountMinor: 500000,
        currency: 'NGN',
        priceDisclosure: 'before VAT',
        options: [],
        variants: [],
      },
      {
        campaignProductId: 'cp-2',
        productId: 'p-2',
        product: { id: 'p-2', name: 'Hoodie', slug: 'hoodie' },
        design: {
          id: 'd-2',
          name: 'Badge',
          thumbnailUrl: 'https://cdn.example.test/badge.jpg',
        },
        baseAmountMinor: 800000,
        currency: 'NGN',
        priceDisclosure: 'before VAT',
        options: [],
        variants: [],
      },
    ]);

    expect(preview).toBe('https://cdn.example.test/badge.jpg');
  });
});
