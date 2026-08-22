import {
  assertPublicJsonLdValue,
  buildBreadcrumbListJsonLd,
  buildOrganizationJsonLd,
  buildWebPageJsonLd,
  buildWebSiteJsonLd,
  serializeJsonLd,
} from '@/lib/structured-data/builders';

describe('structured data builders', () => {
  const originalWebUrl = process.env.NEXT_PUBLIC_WEB_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_WEB_URL = 'https://www.example.test';
  });

  afterEach(() => {
    process.env.NEXT_PUBLIC_WEB_URL = originalWebUrl;
  });

  it('builds organization and website with stable @id relationships', () => {
    const organization = buildOrganizationJsonLd();
    const website = buildWebSiteJsonLd();

    expect(organization['@type']).toBe('Organization');
    expect(organization['@id']).toBe('https://www.example.test/#organization');
    expect(website.publisher).toEqual({ '@id': 'https://www.example.test/#organization' });
    expect(website.inLanguage).toBe('en-NG');
  });

  it('builds breadcrumb and webpage JSON-LD from public paths', () => {
    const breadcrumbs = buildBreadcrumbListJsonLd([
      { label: 'Home', href: '/' },
      { label: 'About', href: '/about' },
    ]);
    const webpage = buildWebPageJsonLd({
      name: 'About',
      description: 'About Tamiym Workshop',
      path: '/about',
    });

    expect(breadcrumbs?.itemListElement).toHaveLength(2);
    expect(webpage.url).toBe('https://www.example.test/about');
    expect(webpage.isPartOf).toEqual({ '@id': 'https://www.example.test/#website' });
  });

  it('serializes JSON-LD safely without script breakout', () => {
    const serialized = serializeJsonLd({
      '@context': 'https://schema.org',
      '@type': 'Thing',
      name: '</script><script>alert(1)</script>',
    });

    expect(serialized).not.toContain('</script>');
    expect(serialized).toContain('\\u003c/script');
  });

  it('rejects blocked private fields in JSON-LD payloads', () => {
    expect(() =>
      assertPublicJsonLdValue({
        organizerId: 'secret',
      })
    ).toThrow(/Blocked JSON-LD field "organizerId"/);
  });
});
