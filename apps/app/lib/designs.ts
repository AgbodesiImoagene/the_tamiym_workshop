import { apiClient, csrfHeaders } from './api';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ModerationStatus = 'PENDING' | 'APPROVED' | 'FLAGGED' | 'REJECTED';

export interface DesignView {
  id: string;
  productViewId: string;
  isUsed: boolean;
  layerCount: number;
}

export interface Design {
  id: string;
  userId?: string;
  productId: string;
  campaignId?: string | null;
  name: string;
  designData: DesignData;
  thumbnailUrl?: string | null;
  moderationStatus: ModerationStatus;
  shareToken?: string | null;
  shareTokenExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
  product: { id: string; name: string; slug: string };
  views?: DesignView[];
}

export interface FabricJson {
  version?: string;
  objects: Record<string, unknown>[];
  background?: string;
  backgroundImage?: Record<string, unknown>;
}

export interface DesignViewData {
  productViewId: string;
  fabricJson: FabricJson;
  isUsed: boolean;
  layerCount: number;
}

export interface DesignData {
  version: number;
  productId: string;
  views: Record<string, DesignViewData>;
}

export interface ProductOption {
  id: string;
  name: string;
  sortOrder: number;
  values: {
    id: string;
    displayName: string;
    valueCode: string;
    metadata: unknown;
    sortOrder: number;
  }[];
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
  layerType: string;
  blendMode: string;
  opacity: number;
  zIndex: number;
  meta: unknown;
  imageUrl: string | null;
}

export interface TemplateEffect {
  id: string;
  optionValueId: string;
  templateLayerId: string;
  effectType: string;
  tintHex: string | null;
  meta: unknown;
  replacementImageUrl: string | null;
}

export interface WorkshopView {
  id: string;
  key: string;
  displayName: string;
  sortOrder: number;
  isDesignable: boolean;
  isDefault: boolean;
  printArea: PrintArea | null;
  templateLayers: TemplateLayer[];
  effects: TemplateEffect[];
}

export interface WorkshopContext {
  product: {
    id: string;
    name: string;
    slug: string;
    options: ProductOption[];
  };
  views: WorkshopView[];
}

export interface CreateDesignDto {
  name: string;
  productId: string;
  designData: DesignData;
  thumbnailUrl?: string;
}

export interface UpdateDesignDto {
  name?: string;
  designData?: DesignData;
  thumbnailUrl?: string;
}

// ---------------------------------------------------------------------------
// API helpers
// ---------------------------------------------------------------------------

/** Fetch everything the Design Workshop editor needs for a product. Public — no auth. */
export async function getProductWorkshop(productId: string): Promise<WorkshopContext> {
  return apiClient.get<WorkshopContext>(`/products/${productId}/workshop`);
}

/** List the current user's designs. */
export async function getMyDesigns(): Promise<Design[]> {
  return apiClient.get<Design[]>('/designs');
}

/** Get a single design by ID (own only). */
export async function getDesign(id: string): Promise<Design> {
  return apiClient.get<Design>(`/designs/${id}`);
}

/** Create a new design. */
export async function createDesign(dto: CreateDesignDto): Promise<Design> {
  return apiClient.post<Design>('/designs', dto);
}

/** Update an existing design (own only). */
export async function updateDesign(id: string, dto: UpdateDesignDto): Promise<Design> {
  return apiClient.patch<Design>(`/designs/${id}`, dto);
}

/** Delete a design (own only). */
export async function deleteDesign(id: string): Promise<void> {
  return apiClient.delete<void>(`/designs/${id}`);
}

/** Clone a design. Returns the new duplicate. */
export async function duplicateDesign(id: string): Promise<Design> {
  return apiClient.post<Design>(`/designs/${id}/duplicate`);
}

/** Generate or regenerate a share link for a design. */
export async function shareDesign(id: string): Promise<{ shareToken: string; shareUrl: string }> {
  return apiClient.post<{ shareToken: string; shareUrl: string }>(`/designs/${id}/share`);
}

/** Upload a thumbnail for a design (PNG/WebP, ≤ 2 MB). */
export async function uploadThumbnail(
  designId: string,
  blob: Blob
): Promise<{ thumbnailUrl: string }> {
  const formData = new FormData();
  formData.append('thumbnail', blob, 'thumb.webp');

  const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1'}/designs/${designId}/thumbnail`;
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers: csrfHeaders(),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw { message: data.message || response.statusText, statusCode: response.status };
  }
  return response.json();
}

/** Upload a user image asset for use in the workshop canvas (PNG/JPEG/WebP, ≤ 10 MB). */
export async function uploadDesignAsset(
  file: File
): Promise<{ designAssetId: string; originalUrl: string | null; status: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1'}/design-assets/upload`;
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    credentials: 'include',
    headers: csrfHeaders(),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw { message: data.message || response.statusText, statusCode: response.status };
  }
  return response.json();
}

/** Read a shared design by share token (public — no auth). */
export async function getSharedDesign(shareToken: string): Promise<Design> {
  const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1'}/public/designs/${shareToken}`;
  const response = await fetch(url, { credentials: 'omit' });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw { message: data.message || response.statusText, statusCode: response.status };
  }
  return response.json();
}
