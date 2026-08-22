import { customerAppPath } from '@/lib/site';
import { getPublicPage, PUBLIC_PAGES } from '@/lib/content/registry';
import type { BreadcrumbItem } from '@/lib/content/types';

export interface NavLink {
  label: string;
  href: string;
}

export const PRIMARY_NAV: readonly NavLink[] = [
  { label: 'Bulk orders', href: '/solutions/bulk' },
  { label: 'Fundraisers', href: '/fundraiser' },
  { label: 'Workshop', href: customerAppPath('/auth/register') },
  { label: 'About', href: '/about' },
] as const;

export const FOOTER_LINK_GROUPS = {
  company: [
    { label: 'About', href: '/about' },
    { label: 'Bulk orders', href: '/solutions/bulk' },
    { label: 'Fundraisers', href: '/fundraiser' },
    { label: 'Workshop', href: customerAppPath('/auth/register') },
    { label: 'Contact Us', href: 'mailto:info@tamiym.org' },
  ],
  information: [
    { label: 'Privacy Policy', href: '/policies/privacy' },
    { label: 'Terms & Conditions', href: '/policies/terms' },
  ],
} as const;

function isExternalHref(href: string): boolean {
  return /^(?:https?:|mailto:|tel:)/i.test(href);
}

function isRegisteredInternalPath(href: string): boolean {
  if (href.startsWith('#') || href.includes('#')) {
    const [pathPart] = href.split('#');
    if (!pathPart || pathPart === '/') return true;
    return getPublicPage(pathPart) !== undefined;
  }
  return getPublicPage(href) !== undefined || href === '/';
}

/** Validates nav/footer targets against the public page registry (for CI). */
export function validateNavTargets(): string[] {
  const errors: string[] = [];
  const allLinks = [...PRIMARY_NAV, ...FOOTER_LINK_GROUPS.company, ...FOOTER_LINK_GROUPS.information];

  for (const link of allLinks) {
    if (isExternalHref(link.href)) continue;
    if (!isRegisteredInternalPath(link.href)) {
      errors.push(`Nav link "${link.label}" points to unregistered path "${link.href}"`);
    }
  }

  return errors;
}

export function getBreadcrumbs(path: string): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [{ label: 'Home', href: '/' }];
  const page = getPublicPage(path);
  if (!page || path === '/') {
    return crumbs;
  }

  if (page.parentPath) {
    const parent = getPublicPage(page.parentPath);
    if (parent && parent.path !== '/') {
      crumbs.push({ label: parent.title, href: parent.path });
    }
  }

  crumbs.push({ label: page.title, href: page.path });
  return crumbs;
}

export function listRegisteredPaths(): string[] {
  return PUBLIC_PAGES.map((page) => page.path);
}

export function validateRelatedPaths(): string[] {
  const errors: string[] = [];
  const paths = new Set(PUBLIC_PAGES.map((page) => page.path));

  for (const page of PUBLIC_PAGES) {
    for (const related of page.relatedPaths ?? []) {
      const [pathPart] = related.split('#');
      if (!paths.has(pathPart) && pathPart !== '/') {
        errors.push(`Page ${page.path} references missing related path "${related}"`);
      }
    }
  }

  return errors;
}
