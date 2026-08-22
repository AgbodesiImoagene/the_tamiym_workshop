import type { BreadcrumbItem } from '@/lib/content/types';
import { ORGANIZATION_FACTS, organizationId, websiteId } from './constants';
import { absoluteWebUrl } from '@/lib/site';

export type JsonLdObject = Record<string, unknown>;

const SCHEMA_CONTEXT = 'https://schema.org';

/** Strip keys that must never appear in public JSON-LD. */
const BLOCKED_JSON_LD_KEYS = new Set([
  'organizerId',
  'moderationStatus',
  'stockOnHand',
  'margin',
  'internalId',
  'sku',
  'password',
  'token',
]);

export function assertPublicJsonLdValue(value: unknown, path = 'root'): void {
  if (value === null || value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertPublicJsonLdValue(entry, `${path}[${index}]`));
    return;
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (BLOCKED_JSON_LD_KEYS.has(key)) {
        throw new Error(`Blocked JSON-LD field "${key}" at ${path}`);
      }
      assertPublicJsonLdValue(nested, `${path}.${key}`);
    }
  }
}

export function serializeJsonLd(data: JsonLdObject | JsonLdObject[]): string {
  assertPublicJsonLdValue(data);
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function buildOrganizationJsonLd(): JsonLdObject {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'Organization',
    '@id': organizationId(),
    name: ORGANIZATION_FACTS.name,
    url: absoluteWebUrl('/'),
    logo: absoluteWebUrl(ORGANIZATION_FACTS.logoPath),
    email: ORGANIZATION_FACTS.email,
    telephone: ORGANIZATION_FACTS.telephone,
    description: ORGANIZATION_FACTS.description,
    areaServed: {
      '@type': 'Country',
      name: ORGANIZATION_FACTS.areaServed,
    },
  };
}

export function buildWebSiteJsonLd(): JsonLdObject {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'WebSite',
    '@id': websiteId(),
    url: absoluteWebUrl('/'),
    name: ORGANIZATION_FACTS.name,
    description: ORGANIZATION_FACTS.description,
    publisher: { '@id': organizationId() },
    inLanguage: 'en-NG',
  };
}

export function buildBreadcrumbListJsonLd(items: readonly BreadcrumbItem[]): JsonLdObject | null {
  if (items.length <= 1) {
    return null;
  }

  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.label,
      item: absoluteWebUrl(item.href),
    })),
  };
}

export function buildWebPageJsonLd(input: {
  name: string;
  description: string;
  path: string;
}): JsonLdObject {
  return {
    '@context': SCHEMA_CONTEXT,
    '@type': 'WebPage',
    '@id': `${absoluteWebUrl(input.path)}#webpage`,
    url: absoluteWebUrl(input.path),
    name: input.name,
    description: input.description,
    isPartOf: { '@id': websiteId() },
    publisher: { '@id': organizationId() },
    inLanguage: 'en-NG',
  };
}

export function buildGlobalStructuredData(): JsonLdObject[] {
  return [buildOrganizationJsonLd(), buildWebSiteJsonLd()];
}
