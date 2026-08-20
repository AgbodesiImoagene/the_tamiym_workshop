import { CurrencyCode, DiscountScope, DiscountStatus, DiscountType } from '@tamiym/types';
import { apiClient } from './api';

export interface AdminDiscountCampaignLink {
  campaignId: string;
  campaign: {
    id: string;
    title: string;
    slug: string;
  };
}

export interface AdminDiscountProductLink {
  productId: string;
  product: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface AdminDiscountVariantLink {
  variantId: string;
  variant: {
    id: string;
    name: string;
    sku: string;
  };
}

export interface AdminDiscount {
  id: string;
  code: string | null;
  type: DiscountType;
  scope: DiscountScope;
  status: DiscountStatus;
  valuePercent: number | null;
  valueAmount: number | null;
  currency: CurrencyCode | null;
  minOrderAmount: number | null;
  startAt: string | null;
  endAt: string | null;
  maxRedemptions: number | null;
  createdAt: string;
  updatedAt: string;
  campaigns: AdminDiscountCampaignLink[];
  products: AdminDiscountProductLink[];
  variants: AdminDiscountVariantLink[];
}

export interface AdminBulkPricingTier {
  id: string;
  productId: string;
  variantId: string | null;
  currency: CurrencyCode;
  minQuantity: number;
  maxQuantity: number | null;
  pricePerUnit: number;
  createdAt: string;
  updatedAt: string;
  product: {
    id: string;
    name: string;
    slug: string;
  };
  variant: {
    id: string;
    name: string;
    sku: string;
  } | null;
}

export interface AdminProductVariantSummary {
  id: string;
  productId: string;
  name: string;
  sku: string;
  isAvailable: boolean;
  inventory: {
    availableQuantity: number | null;
  } | null;
}

export async function getAdminDiscounts() {
  return apiClient.get<AdminDiscount[]>('/admin/discounts');
}

export async function createAdminDiscount(input: {
  code?: string;
  type: DiscountType;
  scope: DiscountScope;
  status?: DiscountStatus;
  valuePercent?: number;
  valueAmount?: number;
  currency?: CurrencyCode;
  minOrderAmount?: number;
  startAt?: string;
  endAt?: string;
  maxRedemptions?: number;
  campaignIds?: string[];
  productIds?: string[];
  variantIds?: string[];
}) {
  return apiClient.post<AdminDiscount>('/admin/discounts', input);
}

export async function updateAdminDiscount(
  id: string,
  input: {
    code?: string;
    status?: DiscountStatus;
    valuePercent?: number;
    valueAmount?: number;
    currency?: CurrencyCode;
    minOrderAmount?: number;
    startAt?: string;
    endAt?: string;
    maxRedemptions?: number;
    campaignIds?: string[];
    productIds?: string[];
    variantIds?: string[];
  }
) {
  return apiClient.patch<AdminDiscount>(`/admin/discounts/${id}`, input);
}

export async function getAdminBulkPricing(productId?: string) {
  const suffix = productId ? `?productId=${encodeURIComponent(productId)}` : '';
  return apiClient.get<AdminBulkPricingTier[]>(`/admin/bulk-pricing${suffix}`);
}

export async function createAdminBulkPricing(input: {
  productId: string;
  variantId?: string;
  currency: CurrencyCode;
  minQuantity: number;
  maxQuantity?: number;
  pricePerUnit: number;
}) {
  return apiClient.post<AdminBulkPricingTier>('/admin/bulk-pricing', input);
}

export async function updateAdminBulkPricing(
  id: string,
  input: {
    minQuantity?: number;
    maxQuantity?: number | null;
    pricePerUnit?: number;
  }
) {
  return apiClient.patch<AdminBulkPricingTier>(`/admin/bulk-pricing/${id}`, input);
}

export async function deleteAdminBulkPricing(id: string) {
  return apiClient.delete<{ deleted: true; id: string }>(`/admin/bulk-pricing/${id}`);
}

export async function getAdminProductVariants(productId: string) {
  return apiClient.get<AdminProductVariantSummary[]>(`/admin/products/${productId}/variants`);
}
