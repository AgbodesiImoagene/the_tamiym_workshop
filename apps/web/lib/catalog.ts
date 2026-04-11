const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1';

export interface StorefrontProduct {
  id: string;
  name: string;
  slug: string;
  description?: string | null;
  category?: {
    id: string;
    name: string;
    slug: string;
  } | null;
  prices: Array<{
    amount: number;
    currency: string;
    compareAt?: number | null;
  }>;
}

export async function getFeaturedProducts(): Promise<StorefrontProduct[]> {
  try {
    const response = await fetch(`${API_BASE_URL}/products`, {
      next: { revalidate: 300 },
    });

    if (!response.ok) {
      return [];
    }

    const products = (await response.json()) as StorefrontProduct[];
    return products.slice(0, 4);
  } catch {
    return [];
  }
}
