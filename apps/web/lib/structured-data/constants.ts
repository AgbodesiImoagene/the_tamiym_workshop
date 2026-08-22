import { marketingAssets } from '@/lib/assets';
import { SITE_NAME, DEFAULT_DESCRIPTION } from '@/lib/metadata';
import { absoluteWebUrl } from '@/lib/site';

/** Approved public organization facts (TTW-073 slice 1). */
export const ORGANIZATION_FACTS = {
  name: SITE_NAME,
  email: 'info@tamiym.org',
  telephone: '+234-916-078-9709',
  areaServed: 'Nigeria',
  description: DEFAULT_DESCRIPTION,
  logoPath: marketingAssets.headerLogo,
} as const;

export function organizationId(): string {
  return `${absoluteWebUrl('/')}#organization`;
}

export function websiteId(): string {
  return `${absoluteWebUrl('/')}#website`;
}
