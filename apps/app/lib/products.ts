import { apiClient } from './api';

export interface DashboardProduct {
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
  productImageRoles: Array<{
    image: {
      url?: string | null;
      altText?: string | null;
    } | null;
  }>;
}

export interface DashboardProductDetail extends DashboardProduct {
  resolvedBasePrice?: number | null;
  resolvedCurrency?: string;
  /** Display images; `variantId` ties an image to one variant (and so to a colour). */
  images: Array<{
    id: string;
    variantId?: string | null;
    url?: string | null;
    altText?: string | null;
  }>;
  variants: Array<{
    id: string;
    name: string;
    sku: string;
    isAvailable: boolean;
    inStock: boolean;
    availableQuantity?: number | null;
    resolvedPrice?: number | null;
    resolvedCompareAt?: number | null;
    resolvedCurrency: string;
    optionValues: Array<{
      option: {
        code: string;
        name: string;
      };
      optionValue: {
        valueCode: string;
        displayName: string;
      };
    }>;
  }>;
}

export interface DashboardCategory {
  id: string;
  name: string;
  slug: string;
}

export interface DashboardProductsParams {
  categorySlug?: string;
  limit?: number;
  offset?: number;
}

export async function getDashboardCategories() {
  return apiClient.get<DashboardCategory[]>('/categories');
}

/** With no argument, behaves as before: the API default page (20 products). */
export async function getDashboardProducts(params: DashboardProductsParams = {}) {
  const query = new URLSearchParams();
  if (params.categorySlug) query.set('categorySlug', params.categorySlug);
  if (params.limit !== undefined) query.set('limit', String(params.limit));
  if (params.offset !== undefined) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiClient.get<DashboardProduct[]>(qs ? `/products?${qs}` : '/products');
}

export async function getDashboardProductDetail(productId: string) {
  return apiClient.get<DashboardProductDetail>(`/products/${productId}`);
}
