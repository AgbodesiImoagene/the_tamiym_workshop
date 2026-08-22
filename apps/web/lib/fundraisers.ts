const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1';

/** Typed selection handoff for TTW-032 campaign cart. */
export interface FundraiserSelection {
  campaignId: string;
  campaignProductId: string;
  productId: string;
  variantId: string;
  designId: string;
  quantity: number;
}

export interface PublicFundraiserOptionValue {
  id: string;
  valueCode: string;
  displayName: string;
  sortOrder: number;
  metadata?: Record<string, unknown> | null;
}

export interface PublicFundraiserOption {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  values: PublicFundraiserOptionValue[];
}

export interface PublicFundraiserVariant {
  id: string;
  optionValueIds: string[];
  optionValueCodes: string[];
  available: boolean;
  unitAmountMinor: number;
  currency: string;
}

export interface PublicFundraiserProduct {
  campaignProductId: string;
  productId: string;
  product: {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
  };
  design: {
    id: string;
    name: string;
    thumbnailUrl?: string | null;
  };
  baseAmountMinor: number;
  currency: string;
  priceDisclosure: string;
  options: PublicFundraiserOption[];
  variants: PublicFundraiserVariant[];
}

export interface PublicFundraiser {
  id: string;
  title: string;
  slug: string;
  /** Present on API payload; only ACTIVE campaigns are returned from the public slug endpoint. */
  status?: string;
  description?: string | null;
  story?: string | null;
  goalAmount?: number | null;
  currentAmount: number;
  currency?: string;
  offerPolicyVersion?: string;
  organizer?: {
    firstName?: string | null;
    lastName?: string | null;
  } | null;
  performance: {
    currentAmount: number;
    goalAmount?: number | null;
    currency: string;
  };
  products: PublicFundraiserProduct[];
}

export interface PublicFundraiserSitemapEntry {
  slug: string;
  updatedAt: Date;
}

/**
 * Fetch indexable fundraiser slugs for sitemap generation.
 */
export async function listPublicFundraiserSlugs(): Promise<PublicFundraiserSitemapEntry[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/public/fundraisers`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return [];
    }

    const body = (await response.json()) as { items?: { slug: string; updatedAt: string }[] };
    return (body.items ?? []).map((item) => ({
      slug: item.slug,
      updatedAt: new Date(item.updatedAt),
    }));
  } catch {
    return [];
  }
}

/**
 * Fetch a public fundraiser by slug.
 * No application-level revalidate cache (TTW-031 interim policy): offer price/availability must stay fresh.
 */
export async function getPublicFundraiser(slug: string): Promise<PublicFundraiser | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/public/fundraisers/${slug}`, {
      cache: 'no-store',
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as PublicFundraiser;
  } catch {
    return null;
  }
}

/** Convert integer minor units to major units for display formatting. */
export function minorToMajor(amountMinor: number, currency: string): number {
  // NGN and default ISO currencies use 100 minor units per major.
  void currency;
  return amountMinor / 100;
}
