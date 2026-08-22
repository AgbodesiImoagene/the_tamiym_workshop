import { buildFundraiserMetadata, buildPageMetadata, truncateDescription } from '@/lib/metadata';
import { absoluteWebUrl, webPublicOrigin } from '@/lib/site';

describe('web metadata helpers', () => {
  const originalWebUrl = process.env.NEXT_PUBLIC_WEB_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_WEB_URL = 'https://www.example.test';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_WEB_URL = originalWebUrl;
  });

  it('resolves canonical origin from env', () => {
    expect(webPublicOrigin()).toBe('https://www.example.test');
    expect(absoluteWebUrl('/fundraiser')).toBe('https://www.example.test/fundraiser');
  });

  it('builds indexable page metadata with canonical and open graph', () => {
    const metadata = buildPageMetadata({
      title: 'About',
      description: 'About Tamiym Workshop',
      path: '/about',
    });

    expect(metadata.alternates?.canonical).toBe('https://www.example.test/about');
    expect(metadata.robots).toEqual({ index: true, follow: true });
    expect(metadata.openGraph?.url).toBe('https://www.example.test/about');
  });

  it('truncates long fundraiser descriptions', () => {
    const long = 'a'.repeat(200);
    expect(truncateDescription(long).length).toBeLessThanOrEqual(160);
  });

  it('builds fundraiser metadata from campaign fields', () => {
    const metadata = buildFundraiserMetadata({
      title: 'School Drive',
      description: 'Help our school',
      story: null,
      slug: 'school-drive',
    });

    expect(metadata.alternates?.canonical).toBe('https://www.example.test/fundraiser/school-drive');
    expect(metadata.robots).toEqual({ index: true, follow: true });
  });
});
