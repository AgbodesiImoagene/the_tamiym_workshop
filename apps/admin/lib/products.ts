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
export type EffectType = 'TINT' | 'REPLACE_IMAGE';

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
  effectType: EffectType;
  tintHex: string | null;
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
}

export interface ProductOption {
  id: string;
  code: string;
  name: string;
  sortOrder: number;
  values: OptionValue[];
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
  images: ProductImage[];
  views: ProductView[];
}

// ─── API Helpers ──────────────────────────────────────────────────────────────

export async function getAdminProductList() {
  return apiClient.get<AdminProductSummary[]>('/admin/products');
}

export async function getAdminProductDetail(id: string) {
  return apiClient.get<AdminProductDetail>(`/admin/products/${id}`);
}

export async function updateAdminProduct(
  id: string,
  dto: { name?: string; slug?: string; description?: string; status?: ProductStatus }
) {
  return apiClient.patch<AdminProductDetail>(`/admin/products/${id}`, dto);
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

export async function deleteAdminProductImage(productId: string, imageId: string) {
  return apiClient.delete(`/admin/products/${productId}/images/${imageId}`);
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

export async function updateAdminProductView(
  productId: string,
  viewId: string,
  dto: { displayName?: string; sortOrder?: number; isDesignable?: boolean; isDefault?: boolean }
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
