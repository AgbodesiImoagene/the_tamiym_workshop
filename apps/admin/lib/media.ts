import { apiClient } from './api';
import type { ModerationStatus } from './designs';

export type { ModerationStatus };

// ─── Types ────────────────────────────────────────────────────────────────────

export type MediaAssetStatus = 'PENDING' | 'PROCESSING' | 'READY' | 'FAILED';
export type MediaDerivativeType = 'ORIGINAL' | 'DISPLAY' | 'THUMB';

export interface MediaDerivative {
  type: MediaDerivativeType;
  url: string;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
}

export interface MediaUploader {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface MediaDesignAsset {
  id: string;
  owner: MediaUploader;
}

export interface MediaProductImage {
  id: string;
  altText: string | null;
  product: { id: string; name: string; slug: string };
}

/** Summary row returned by GET /admin/media */
export interface AdminMediaAsset {
  id: string;
  status: MediaAssetStatus;
  moderationStatus: ModerationStatus;
  moderationNotes: string | null;
  originalMime: string | null;
  originalBytes: number | null;
  originalWidth: number | null;
  originalHeight: number | null;
  createdAt: string;
  updatedAt: string;
  derivatives: Pick<MediaDerivative, 'type' | 'url'>[];
  designAssets: Pick<MediaDesignAsset, 'owner'>[];
  productImages: Pick<MediaProductImage, 'product'>[];
}

/** Full detail returned by GET /admin/media/:id */
export interface AdminMediaAssetDetail extends Omit<
  AdminMediaAsset,
  'designAssets' | 'productImages'
> {
  derivatives: MediaDerivative[];
  designAssets: MediaDesignAsset[];
  productImages: MediaProductImage[];
}

// ─── UI maps ──────────────────────────────────────────────────────────────────

export const MEDIA_STATUS_BADGE: Record<
  ModerationStatus,
  { variant: 'brand' | 'accent' | 'neutral' | 'danger'; label: string }
> = {
  PENDING: { variant: 'neutral', label: 'Pending' },
  APPROVED: { variant: 'accent', label: 'Approved' },
  REJECTED: { variant: 'danger', label: 'Rejected' },
  FLAGGED: { variant: 'brand', label: 'Flagged' },
};

/** Best available URL for display: prefer THUMB, then DISPLAY, then ORIGINAL */
export function bestDerivativeUrl(
  derivatives: Pick<MediaDerivative, 'type' | 'url'>[]
): string | null {
  for (const t of ['THUMB', 'DISPLAY', 'ORIGINAL'] as MediaDerivativeType[]) {
    const d = derivatives.find((x) => x.type === t);
    if (d) return d.url;
  }
  return null;
}

/** Human-readable bytes */
export function formatBytes(bytes: number | null): string {
  if (bytes == null) return '–';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ─── API helpers ──────────────────────────────────────────────────────────────

export async function getAdminMediaAssets(status?: ModerationStatus) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiClient.get<AdminMediaAsset[]>(`/admin/media${qs}`);
}

export async function getAdminMediaAsset(id: string) {
  return apiClient.get<AdminMediaAssetDetail>(`/admin/media/${id}`);
}

export async function moderateMediaAsset(
  id: string,
  status: 'APPROVED' | 'REJECTED' | 'FLAGGED',
  notes?: string
) {
  return apiClient.patch<AdminMediaAssetDetail>(`/admin/media/${id}/moderation`, {
    status,
    notes,
  });
}
