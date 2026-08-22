import type { Metadata } from 'next';
import { absoluteWebUrl, webPublicOrigin } from './site';

export const SITE_NAME = 'Tamiym Workshop';

export const DEFAULT_DESCRIPTION =
  'Tamiym Workshop helps teams, communities, and organizers launch branded merchandise and fundraising campaigns in Nigeria.';

export function truncateDescription(text: string, maxLength = 160): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }
  return `${normalized.slice(0, maxLength - 1).trimEnd()}…`;
}

export function buildPageMetadata(input: {
  title: string;
  description: string;
  path: string;
  index?: boolean;
}): Metadata {
  const indexable = input.index !== false;
  const canonical = absoluteWebUrl(input.path);
  const title = input.title.includes(SITE_NAME) ? input.title : `${input.title} | ${SITE_NAME}`;

  return {
    title,
    description: input.description,
    alternates: { canonical },
    robots: indexable
      ? { index: true, follow: true }
      : { index: false, follow: false, nocache: true },
    openGraph: {
      title,
      description: input.description,
      url: canonical,
      siteName: SITE_NAME,
      locale: 'en_NG',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: input.description,
    },
  };
}

export function buildFundraiserMetadata(input: {
  title: string;
  description?: string | null;
  story?: string | null;
  slug: string;
}): Metadata {
  const description = truncateDescription(
    input.description?.trim() ||
      input.story?.trim() ||
      `Support ${input.title} with custom merchandise on Tamiym Workshop.`
  );

  return buildPageMetadata({
    title: input.title,
    description,
    path: `/fundraiser/${input.slug}`,
    index: true,
  });
}

export function noIndexMetadata(title: string, path: string): Metadata {
  return buildPageMetadata({
    title,
    description: DEFAULT_DESCRIPTION,
    path,
    index: false,
  });
}

export function rootMetadata(): Metadata {
  return {
    metadataBase: new URL(webPublicOrigin()),
    title: {
      default: SITE_NAME,
      template: `%s | ${SITE_NAME}`,
    },
    description: DEFAULT_DESCRIPTION,
    icons: {
      icon: '/favicon.ico',
      shortcut: '/favicon.ico',
    },
  };
}
