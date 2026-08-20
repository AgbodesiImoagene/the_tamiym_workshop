import { apiClient } from './api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1';

// ─── Enums (mirror backend) ───────────────────────────────────────────────────

export type TemplateLayerType =
  | 'BASE'
  | 'SHADOW'
  | 'HIGHLIGHT'
  | 'MASK'
  | 'OVERLAY'
  | 'PRINT_SIMULATION'
  | 'OTHER';

export type BlendMode =
  | 'NORMAL'
  | 'MULTIPLY'
  | 'SCREEN'
  | 'OVERLAY'
  | 'DARKEN'
  | 'LIGHTEN'
  | 'COLOR_DODGE'
  | 'COLOR_BURN'
  | 'HARD_LIGHT'
  | 'SOFT_LIGHT'
  | 'DIFFERENCE'
  | 'EXCLUSION';

export type ProductStatus = 'DRAFT' | 'ACTIVE' | 'ARCHIVED';

/** Option-value → template layer rules (workshop). */
export type WorkshopTemplateEffectType = 'TINT' | 'SHOW' | 'HIDE' | 'REPLACE_IMAGE';

export type CatalogImageRole = 'THUMBNAIL' | 'GALLERY' | 'WORKSHOP_TEMPLATE';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AdminProductSummary {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  description: string | null;
  updatedAt: string;
  thumbnailUrl: string | null;
  category: { id: string; name: string; slug: string } | null;
  _count: { views: number; variants: number };
}

export interface PrintArea {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotationAllowed: boolean;
  maxLayers: number | null;
  maxColors: number | null;
}

export interface TemplateLayer {
  id: string;
  key: string;
  displayName: string | null;
  layerType: TemplateLayerType;
  imageId: string;
  blendMode: BlendMode;
  opacity: number;
  zIndex: number;
  meta: Record<string, unknown> | null;
  imageUrl: string | null;
  image: {
    id: string;
    altText: string | null;
    mediaAsset: {
      originalUrl: string | null;
      derivatives: Array<{ type: string; url: string }>;
    } | null;
  } | null;
}

export interface TemplateEffect {
  id: string;
  optionId: string | null;
  optionValueId: string;
  templateLayerId: string;
  effectType: WorkshopTemplateEffectType;
  tintHex: string | null;
  replacementImageId: string | null;
  meta: Record<string, unknown> | null;
}

export interface ProductView {
  id: string;
  key: string;
  displayName: string;
  sortOrder: number;
  isDesignable: boolean;
  isDefault: boolean;
  printAreas: PrintArea[];
  templateLayers: TemplateLayer[];
  templateEffects: TemplateEffect[];
}

export interface ProductImage {
  id: string;
  altText: string | null;
  sortOrder: number;
  variantId: string | null;
  mediaAsset: {
    status: string;
    originalUrl: string | null;
    derivatives: Array<{ type: string; url: string }>;
  } | null;
}

export interface OptionValue {
  id: string;
  valueCode: string;
  displayName: string;
  sortOrder: number;
  metadata: Record<string, unknown> | null;
}

export interface ProductOption {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  values: OptionValue[];
}

export interface AdminProductPrice {
  id: string;
  currency: string;
  amount: string;
  compareAt: string | null;
}

export interface AdminProductImageRoleRow {
  id: string;
  role: CatalogImageRole;
  sortOrder: number | null;
  productViewId: string | null;
  image: {
    id: string;
    altText: string | null;
    sortOrder: number;
    mediaAsset: ProductImage['mediaAsset'];
  };
}

export interface AdminProductDetail {
  id: string;
  name: string;
  slug: string;
  status: ProductStatus;
  description: string | null;
  updatedAt: string;
  category: { id: string; name: string; slug: string } | null;
  options: ProductOption[];
  prices: AdminProductPrice[];
  productImageRoles: AdminProductImageRoleRow[];
  images: ProductImage[];
  views: ProductView[];
}

export interface AdminCategory {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminVariantInventory {
  id: string;
  variantId: string;
  stockOnHand: number;
  reserved: number;
  trackInventory: boolean;
  lowStockThreshold: number;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProductVariant {
  id: string;
  productId: string;
  sku: string;
  name: string;
  isAvailable: boolean;
  weightGrams: number | null;
  packageLengthMm: number | null;
  packageWidthMm: number | null;
  packageHeightMm: number | null;
  createdAt: string;
  updatedAt: string;
  optionValues: Array<{
    option: { code: string; name: string };
    optionValue: {
      valueCode: string;
      displayName: string;
      metadata: unknown;
    };
  }>;
  prices: Array<{
    id: string;
    currency: string;
    amount: string;
    compareAt: string | null;
  }>;
  inventory: AdminVariantInventory | null;
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

export async function getAdminProductList() {
  return apiClient.get<AdminProductSummary[]>('/admin/products');
}

export async function getAdminCategoryList() {
  return apiClient.get<AdminCategory[]>('/admin/categories');
}

export async function createAdminCategory(dto: {
  name: string;
  slug?: string;
  description?: string;
}) {
  return apiClient.post<AdminCategory>('/admin/categories', dto);
}

export async function updateAdminCategory(
  id: string,
  dto: { name?: string; slug?: string; description?: string }
) {
  return apiClient.patch<AdminCategory>(`/admin/categories/${id}`, dto);
}

export async function deleteAdminCategory(id: string) {
  return apiClient.delete<void>(`/admin/categories/${id}`);
}

export async function getAdminProductDetail(id: string) {
  return apiClient.get<AdminProductDetail>(`/admin/products/${id}`);
}

export async function updateAdminProduct(
  id: string,
  dto: {
    categoryId?: string;
    name?: string;
    slug?: string;
    description?: string;
    status?: ProductStatus;
    weightGrams?: number;
    packageLengthMm?: number;
    packageWidthMm?: number;
    packageHeightMm?: number;
  }
) {
  return apiClient.patch<AdminProductDetail>(`/admin/products/${id}`, dto);
}

export async function createAdminProduct(dto: {
  categoryId: string;
  name: string;
  slug?: string;
  description?: string;
  status?: ProductStatus;
  weightGrams?: number;
  packageLengthMm?: number;
  packageWidthMm?: number;
  packageHeightMm?: number;
}) {
  return apiClient.post<{ id: string; name: string; slug: string }>('/admin/products', dto);
}

export async function deleteAdminProduct(id: string) {
  return apiClient.delete<void>(`/admin/products/${id}`);
}

// ─── Options & option values ─────────────────────────────────────────────────

export async function createAdminProductOption(
  productId: string,
  dto: { code: string; name: string; sortOrder?: number }
) {
  return apiClient.post<ProductOption>(`/admin/products/${productId}/options`, dto);
}

export async function updateAdminProductOption(
  productId: string,
  optionId: string,
  dto: { code?: string; name?: string; sortOrder?: number }
) {
  return apiClient.patch<ProductOption>(`/admin/products/${productId}/options/${optionId}`, dto);
}

export async function deleteAdminProductOption(productId: string, optionId: string) {
  return apiClient.delete<void>(`/admin/products/${productId}/options/${optionId}`);
}

export async function createAdminOptionValue(
  productId: string,
  optionId: string,
  dto: {
    valueCode: string;
    displayName: string;
    metadata?: Record<string, unknown>;
    sortOrder?: number;
  }
) {
  return apiClient.post<OptionValue>(
    `/admin/products/${productId}/options/${optionId}/values`,
    dto
  );
}

export async function updateAdminOptionValue(
  productId: string,
  optionId: string,
  valueId: string,
  dto: {
    valueCode?: string;
    displayName?: string;
    metadata?: Record<string, unknown>;
    sortOrder?: number;
  }
) {
  return apiClient.patch<OptionValue>(
    `/admin/products/${productId}/options/${optionId}/values/${valueId}`,
    dto
  );
}

export async function deleteAdminOptionValue(productId: string, optionId: string, valueId: string) {
  return apiClient.delete<void>(
    `/admin/products/${productId}/options/${optionId}/values/${valueId}`
  );
}

// ─── Product-level prices ─────────────────────────────────────────────────────

export async function upsertAdminProductPrice(
  productId: string,
  dto: { currency: string; amount: number; compareAt?: number }
) {
  return apiClient.post<AdminProductPrice>(`/admin/products/${productId}/prices`, dto);
}

export async function updateAdminProductPrice(
  productId: string,
  priceId: string,
  dto: { currency?: string; amount?: number; compareAt?: number | null }
) {
  return apiClient.patch<AdminProductPrice>(`/admin/products/${productId}/prices/${priceId}`, dto);
}

export async function deleteAdminProductPrice(productId: string, priceId: string) {
  return apiClient.delete<void>(`/admin/products/${productId}/prices/${priceId}`);
}

// ─── Variant catalog, prices & inventory ──────────────────────────────────────

export async function listAdminProductVariants(productId: string) {
  return apiClient.get<AdminProductVariant[]>(`/admin/products/${productId}/variants`);
}

export async function patchAdminVariantInventory(
  variantId: string,
  dto: {
    stockOnHand?: number;
    reserved?: number;
    lowStockThreshold?: number;
    trackInventory?: boolean;
    isAvailable?: boolean;
  }
) {
  return apiClient.patch<unknown>(`/admin/inventory/variant/${variantId}`, dto);
}

export async function updateAdminProductVariant(
  productId: string,
  variantId: string,
  dto: {
    name?: string;
    sku?: string;
    isAvailable?: boolean;
    weightGrams?: number;
    packageLengthMm?: number;
    packageWidthMm?: number;
    packageHeightMm?: number;
  }
) {
  return apiClient.patch<unknown>(`/admin/products/${productId}/variants/${variantId}`, dto);
}

export async function deleteAdminProductVariant(productId: string, variantId: string) {
  return apiClient.delete<void>(`/admin/products/${productId}/variants/${variantId}`);
}

export async function upsertAdminVariantPrice(
  productId: string,
  variantId: string,
  dto: { currency: string; amount: number; compareAt?: number }
) {
  return apiClient.post<{
    id: string;
    currency: string;
    amount: string;
    compareAt: string | null;
  }>(`/admin/products/${productId}/variants/${variantId}/prices`, dto);
}

export async function updateAdminVariantPrice(
  productId: string,
  variantId: string,
  priceId: string,
  dto: { currency?: string; amount?: number; compareAt?: number | null }
) {
  return apiClient.patch<{
    id: string;
    currency: string;
    amount: string;
    compareAt: string | null;
  }>(`/admin/products/${productId}/variants/${variantId}/prices/${priceId}`, dto);
}

export async function deleteAdminVariantPrice(
  productId: string,
  variantId: string,
  priceId: string
) {
  return apiClient.delete<void>(
    `/admin/products/${productId}/variants/${variantId}/prices/${priceId}`
  );
}

// ─── Product Image ────────────────────────────────────────────────────────────

/** Upload a product image (multipart). Returns the ProductImage record with id. */
export async function uploadAdminProductImage(
  productId: string,
  file: File,
  opts: { altText?: string; sortOrder?: number } = {}
): Promise<ProductImage & { id: string }> {
  const form = new FormData();
  form.append('file', file);
  if (opts.altText) form.append('altText', opts.altText);
  if (opts.sortOrder !== undefined) form.append('sortOrder', String(opts.sortOrder));

  const url = `${API_BASE_URL}/admin/products/${productId}/images/upload`;
  const res = await fetch(url, {
    method: 'POST',
    body: form,
    credentials: 'include',
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw { message: err.message || res.statusText, statusCode: res.status };
  }
  return res.json();
}

export async function createAdminProductImageFromUrl(
  productId: string,
  dto: {
    sourceUrl: string;
    sortOrder?: number;
    altText?: string;
    variantId?: string;
  }
) {
  return apiClient.post<ProductImage & { id: string }>(`/admin/products/${productId}/images`, dto);
}

export async function updateAdminProductImageMeta(
  productId: string,
  imageId: string,
  dto: {
    sortOrder?: number;
    altText?: string;
    variantId?: string | null;
    mediaAssetId?: string;
  }
) {
  return apiClient.patch<ProductImage>(`/admin/products/${productId}/images/${imageId}`, dto);
}

export async function deleteAdminProductImage(productId: string, imageId: string) {
  return apiClient.delete(`/admin/products/${productId}/images/${imageId}`);
}

// ─── Image roles ──────────────────────────────────────────────────────────────

export async function createAdminProductImageRole(
  productId: string,
  imageId: string,
  dto: { role: CatalogImageRole; productViewId?: string; sortOrder?: number }
) {
  return apiClient.post<{ id: string }>(
    `/admin/products/${productId}/images/${imageId}/roles`,
    dto
  );
}

export async function updateAdminProductImageRole(
  productId: string,
  roleId: string,
  dto: {
    role?: CatalogImageRole;
    productViewId?: string | null;
    sortOrder?: number | null;
  }
) {
  return apiClient.patch<{ id: string }>(`/admin/products/${productId}/image-roles/${roleId}`, dto);
}

export async function deleteAdminProductImageRole(productId: string, roleId: string) {
  return apiClient.delete<void>(`/admin/products/${productId}/image-roles/${roleId}`);
}

// ─── Product Views ────────────────────────────────────────────────────────────

export async function createAdminProductView(
  productId: string,
  dto: {
    key: string;
    displayName: string;
    sortOrder?: number;
    isDesignable?: boolean;
    isDefault?: boolean;
  }
) {
  return apiClient.post<ProductView>(`/admin/products/${productId}/views`, dto);
}

export type UpdateAdminProductViewDto = {
  key?: string;
  displayName?: string;
  sortOrder?: number;
  isDesignable?: boolean;
  isDefault?: boolean;
};

export async function updateAdminProductView(
  productId: string,
  viewId: string,
  dto: UpdateAdminProductViewDto
) {
  return apiClient.patch<ProductView>(`/admin/products/${productId}/views/${viewId}`, dto);
}

export async function deleteAdminProductView(productId: string, viewId: string) {
  return apiClient.delete(`/admin/products/${productId}/views/${viewId}`);
}

// ─── Print Area ───────────────────────────────────────────────────────────────

export async function upsertAdminPrintArea(
  productId: string,
  viewId: string,
  dto: {
    x: number;
    y: number;
    width: number;
    height: number;
    rotationAllowed?: boolean;
    maxLayers?: number;
    maxColors?: number;
  }
) {
  return apiClient.post<PrintArea>(`/admin/products/${productId}/views/${viewId}/print-area`, dto);
}

// ─── Template Layers ──────────────────────────────────────────────────────────

export async function createAdminTemplateLayer(
  productId: string,
  viewId: string,
  dto: {
    key: string;
    displayName?: string;
    layerType: TemplateLayerType;
    imageId: string;
    blendMode?: BlendMode;
    opacity?: number;
    zIndex?: number;
    meta?: Record<string, unknown>;
  }
) {
  return apiClient.post<TemplateLayer>(`/admin/products/${productId}/views/${viewId}/layers`, dto);
}

export async function updateAdminTemplateLayer(
  productId: string,
  viewId: string,
  layerId: string,
  dto: {
    key?: string;
    displayName?: string;
    layerType?: TemplateLayerType;
    blendMode?: BlendMode;
    opacity?: number;
    zIndex?: number;
  }
) {
  return apiClient.patch<TemplateLayer>(
    `/admin/products/${productId}/views/${viewId}/layers/${layerId}`,
    dto
  );
}

export async function deleteAdminTemplateLayer(productId: string, viewId: string, layerId: string) {
  return apiClient.delete(`/admin/products/${productId}/views/${viewId}/layers/${layerId}`);
}

// ─── Template effects (option → layer rules) ───────────────────────────────────

export async function createAdminTemplateEffect(
  productId: string,
  viewId: string,
  dto: {
    optionId: string;
    optionValueId: string;
    templateLayerId: string;
    effectType: WorkshopTemplateEffectType;
    tintHex?: string;
    replacementImageId?: string;
    meta?: Record<string, unknown>;
  }
) {
  return apiClient.post<TemplateEffect>(
    `/admin/products/${productId}/views/${viewId}/effects`,
    dto
  );
}

export async function updateAdminTemplateEffect(
  productId: string,
  viewId: string,
  effectId: string,
  dto: {
    optionId?: string;
    optionValueId?: string;
    templateLayerId?: string;
    effectType?: WorkshopTemplateEffectType;
    tintHex?: string | null;
    replacementImageId?: string | null;
    meta?: Record<string, unknown> | null;
  }
) {
  return apiClient.patch<TemplateEffect>(
    `/admin/products/${productId}/views/${viewId}/effects/${effectId}`,
    dto
  );
}

export async function deleteAdminTemplateEffect(
  productId: string,
  viewId: string,
  effectId: string
) {
  return apiClient.delete<void>(`/admin/products/${productId}/views/${viewId}/effects/${effectId}`);
}

// ─── CSS blend mode map ───────────────────────────────────────────────────────

/** Maps our BlendMode enum values to CSS mix-blend-mode values. */
export const BLEND_MODE_CSS: Record<BlendMode, string> = {
  NORMAL: 'normal',
  MULTIPLY: 'multiply',
  SCREEN: 'screen',
  OVERLAY: 'overlay',
  DARKEN: 'darken',
  LIGHTEN: 'lighten',
  COLOR_DODGE: 'color-dodge',
  COLOR_BURN: 'color-burn',
  HARD_LIGHT: 'hard-light',
  SOFT_LIGHT: 'soft-light',
  DIFFERENCE: 'difference',
  EXCLUSION: 'exclusion',
};

export const LAYER_TYPE_LABELS: Record<TemplateLayerType, string> = {
  BASE: 'Base',
  SHADOW: 'Shadow',
  HIGHLIGHT: 'Highlight',
  MASK: 'Mask',
  OVERLAY: 'Overlay',
  PRINT_SIMULATION: 'Print Simulation',
  OTHER: 'Other',
};

export const LAYER_TYPE_COLORS: Record<TemplateLayerType, string> = {
  BASE: 'bg-blue-100 text-blue-700',
  SHADOW: 'bg-gray-100 text-gray-700',
  HIGHLIGHT: 'bg-yellow-100 text-yellow-700',
  MASK: 'bg-purple-100 text-purple-700',
  OVERLAY: 'bg-orange-100 text-orange-700',
  PRINT_SIMULATION: 'bg-green-100 text-green-700',
  OTHER: 'bg-gray-100 text-gray-500',
};
