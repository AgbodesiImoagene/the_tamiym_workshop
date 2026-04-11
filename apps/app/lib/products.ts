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

export async function getDashboardProducts() {
  return apiClient.get<DashboardProduct[]>('/products');
}

export async function getDashboardProductDetail(productId: string) {
  return apiClient.get<DashboardProductDetail>(`/products/${productId}`);
}
