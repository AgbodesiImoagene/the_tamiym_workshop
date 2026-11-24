import { apiClient, apiFetch } from './api';

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

/**
 * What the public share endpoint returns (`DesignsService.findByShareToken`): an
 * allowlist. There is no `productId` (use `product.id`), no owner id and no moderation
 * status. Not the owner's `Design` (TTW-236).
 */
export interface SharedDesign {
  id: string;
  name: string;
  designData: DesignData;
  thumbnailUrl?: string | null;
  createdAt: string;
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
}

export interface UpdateDesignDto {
  name?: string;
  designData?: DesignData;
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
  return apiClient.get<Design>(`/designs/${encodeURIComponent(id)}`);
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

  // Through `apiFetch`: renews the session when the access cookie expired during a long editing
  // session (TTW-262). No Content-Type: the browser sets the multipart boundary.
  const response = await apiFetch(`/designs/${designId}/thumbnail`, {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw { message: data.message || response.statusText, statusCode: response.status };
  }
  return response.json();
}

const API_BASE_URL = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1';

/**
 * Stable API path of a private customer image (TTW-099). It needs the session cookie and
 * is what a saved design stores: a storage link would expire, this path does not.
 */
export function designAssetFileUrl(
  designAssetId: string,
  variant: 'original' | 'display' | 'thumb' = 'original'
): string {
  return `${API_BASE_URL()}/design-assets/${encodeURIComponent(designAssetId)}/file?variant=${variant}`;
}

/**
 * `crossOrigin` to give a Fabric image. Our own private files need the session cookie, so
 * they load with credentials; everything else (the public catalogue) stays anonymous.
 */
export function imageCrossOrigin(src: string): 'use-credentials' | 'anonymous' {
  try {
    const url = new URL(src);
    const base = new URL(API_BASE_URL());
    if (url.origin === base.origin && url.pathname.startsWith(`${base.pathname}/design-assets/`)) {
      return 'use-credentials';
    }
  } catch {
    // Not a valid URL: treat as public.
  }
  return 'anonymous';
}

/**
 * Public, token-scoped path of a customer image used by a shared design (TTW-234). The
 * share token is the capability: no session, no cookie.
 */
export function sharedDesignAssetUrl(
  shareToken: string,
  designAssetId: string,
  variant: 'original' | 'display' | 'thumb' = 'original'
): string {
  return `${API_BASE_URL()}/public/designs/${encodeURIComponent(shareToken)}/assets/${encodeURIComponent(designAssetId)}/file?variant=${variant}`;
}

/**
 * Copy of a saved design whose customer images read through the share token instead of the
 * owner's session (TTW-234). Public images and text are left as they are, and the input
 * is not modified: the saved design keeps its session-only paths.
 */
export function rewriteSharedImageSources(
  fabricJson: FabricJson | null,
  shareToken: string
): FabricJson | null {
  if (!fabricJson) return fabricJson;
  return { ...fabricJson, objects: rewriteObjects(fabricJson.objects, shareToken) };
}

/** Objects can nest (a group holds `objects`), as the server's scan of the design does. */
function rewriteObjects(
  objects: Record<string, unknown>[],
  shareToken: string
): Record<string, unknown>[] {
  return objects.map((object) => {
    const designAssetId = (object.data as { designAssetId?: unknown } | undefined)?.designAssetId;
    if (typeof designAssetId === 'string' && designAssetId.length > 0) {
      return {
        ...object,
        src: sharedDesignAssetUrl(shareToken, designAssetId),
        crossOrigin: 'anonymous',
      };
    }
    if (Array.isArray(object.objects)) {
      return {
        ...object,
        objects: rewriteObjects(object.objects as Record<string, unknown>[], shareToken),
      };
    }
    return object;
  });
}

/** Upload a user image asset for use in the workshop canvas (PNG/JPEG/WebP, ≤ 10 MB). */
export async function uploadDesignAsset(
  file: File
): Promise<{ designAssetId: string; status: string }> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await apiFetch('/design-assets/upload', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw { message: data.message || response.statusText, statusCode: response.status };
  }
  return response.json();
}

/** Read a shared design by share token (public — no auth). */
export async function getSharedDesign(shareToken: string): Promise<SharedDesign> {
  const url = `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1'}/public/designs/${shareToken}`;
  const response = await fetch(url, { credentials: 'omit' });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw { message: data.message || response.statusText, statusCode: response.status };
  }
  return response.json();
}
