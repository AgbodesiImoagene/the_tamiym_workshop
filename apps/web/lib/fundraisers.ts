const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1';

export interface PublicFundraiserProduct {
  id: string;
  design?: {
    id: string;
    name: string;
    thumbnailUrl?: string | null;
  } | null;
  product: {
    id: string;
    name: string;
    slug: string;
    description?: string | null;
  };
  prices: Array<{
    id?: string;
    amount: number;
    currency: string;
  }>;
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

export async function getPublicFundraiser(slug: string): Promise<PublicFundraiser | null> {
  try {
    const response = await fetch(`${API_BASE_URL}/public/fundraisers/${slug}`, {
      next: { revalidate: 120 },
    });

    if (!response.ok) {
      return null;
    }

    return (await response.json()) as PublicFundraiser;
  } catch {
    return null;
  }
}
