import { listIndexableStaticPaths, PUBLIC_PAGES, getPublicPage } from '@/lib/content/registry';
import {
  getBreadcrumbs,
  validateNavTargets,
  validateRelatedPaths,
  PRIMARY_NAV,
} from '@/lib/public-ia';

describe('public IA registry', () => {
  it('registers unique paths', () => {
    const paths = PUBLIC_PAGES.map((page) => page.path);
    expect(new Set(paths).size).toBe(paths.length);
  });

  it('lists indexable static paths including bulk solutions', () => {
    expect(listIndexableStaticPaths()).toEqual(
      expect.arrayContaining(['/', '/about', '/fundraiser', '/solutions/bulk'])
    );
    expect(listIndexableStaticPaths()).not.toContain('/policies/privacy');
  });

  it('builds breadcrumbs for nested pages', () => {
    const crumbs = getBreadcrumbs('/solutions/bulk');
    expect(crumbs[0]).toEqual({ label: 'Home', href: '/' });
    expect(crumbs.at(-1)?.href).toBe('/solutions/bulk');
  });

  it('validates nav targets against registry', () => {
    expect(validateNavTargets()).toEqual([]);
    expect(PRIMARY_NAV.length).toBeGreaterThanOrEqual(4);
  });

  it('validates related path references', () => {
    expect(validateRelatedPaths()).toEqual([]);
  });

  it('exposes page metadata for solutions bulk', () => {
    const page = getPublicPage('/solutions/bulk');
    expect(page?.intentClusters).toContain('Q-BULK');
    expect(page?.indexable).toBe(true);
  });
});
