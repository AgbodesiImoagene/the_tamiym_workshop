import { apiClient } from './api';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'FLAGGED';

export interface DesignUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
}

export interface DesignProduct {
  id: string;
  name: string;
  slug: string;
}

export interface DesignView {
  id: string;
  productViewId: string;
  isUsed: boolean;
  layerCount: number;
}

export interface AdminDesign {
  id: string;
  name: string;
  thumbnailUrl: string | null;
  moderationStatus: ModerationStatus;
  moderationNotes: string | null;
  createdAt: string;
  updatedAt: string;
  shareToken: string | null;
  user: DesignUser;
  product: DesignProduct | null;
}

export interface AdminDesignDetail extends AdminDesign {
  designData: unknown;
  views: DesignView[];
}

export const MODERATION_STATUS_LABELS: Record<ModerationStatus, string> = {
  PENDING: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  FLAGGED: 'Flagged for review',
};

export const MODERATION_STATUS_BADGE: Record<
  ModerationStatus,
  { variant: 'brand' | 'accent' | 'neutral' | 'danger'; label: string }
> = {
  PENDING: { variant: 'neutral', label: 'Pending' },
  APPROVED: { variant: 'accent', label: 'Approved' },
  REJECTED: { variant: 'danger', label: 'Rejected' },
  FLAGGED: { variant: 'brand', label: 'Flagged' },
};

// ─── API Helpers ──────────────────────────────────────────────────────────────

export async function getAdminDesigns(status?: ModerationStatus) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiClient.get<AdminDesign[]>(`/admin/designs${qs}`);
}

export async function getAdminDesign(id: string) {
  return apiClient.get<AdminDesignDetail>(`/admin/designs/${id}`);
}

export async function moderateDesign(
  id: string,
  status: 'APPROVED' | 'REJECTED' | 'FLAGGED',
  notes?: string
) {
  return apiClient.patch<AdminDesignDetail>(`/admin/designs/${id}/moderation`, {
    status,
    notes,
  });
}
