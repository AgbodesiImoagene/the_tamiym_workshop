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
  /** List card summary (TTW-204). Absent on the detail endpoint. */
  colors?: Array<{ code: string; name: string; hex: string | null }>;
  /** Badges an admin sets on the product (TTW-267). Display only. */
  isBestSeller?: boolean;
  expressProduction?: boolean;
  /** For example "S-5XL"; `null` when the product has no sizes. */
  sizeRange?: string | null;
  /** Product-level bulk tier with the lowest unit price; display only. */
  bulkTier?: { minQuantity: number; pricePerUnit: number } | null;
}

export interface DashboardProductDetail extends DashboardProduct {
  resolvedBasePrice?: number | null;
  resolvedBaseCompareAt?: number | null;
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
        /** Free JSON set by the admin; a colour keeps its swatch in `hex`. */
        metadata?: unknown;
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

const ALL_PRODUCTS_PAGE_SIZE = 100; // the API maximum
const ALL_PRODUCTS_MAX_PAGES = 50; // bounds the read at 5,000 products

/** Every product, read page by page (the API has no total). Fails if any page fails. */
export async function getAllDashboardProducts() {
  const all: DashboardProduct[] = [];
  for (let page = 0; page < ALL_PRODUCTS_MAX_PAGES; page += 1) {
    const batch = await getDashboardProducts({
      limit: ALL_PRODUCTS_PAGE_SIZE,
      offset: page * ALL_PRODUCTS_PAGE_SIZE,
    });
    all.push(...batch);
    if (batch.length < ALL_PRODUCTS_PAGE_SIZE) break;
  }
  return all;
}

export async function getDashboardProductDetail(productId: string) {
  return apiClient.get<DashboardProductDetail>(`/products/${productId}`);
}
