import { apiClient } from './api';

export interface CampaignOfferDesign {
  id: string;
  name: string;
  thumbnailUrl?: string | null;
  moderationStatus: 'PENDING' | 'APPROVED' | 'FLAGGED' | 'REJECTED';
}

export interface CampaignOwnerOffer {
  id: string;
  productId: string;
  designId: string | null;
  product: { id: string; name: string; slug: string; status?: string };
  design: CampaignOfferDesign | null;
  price: number | null;
  currency: string;
  minimumPrice: number;
  priceGuidance: string;
}

export interface CampaignOwnerDetail {
  id: string;
  title: string;
  slug: string;
  description?: string | null;
  story?: string | null;
  status: string;
  goalAmount?: number | null;
  currentAmount?: number | null;
  currency: string;
  draftRevision: number;
  startDate?: string | null;
  endDate?: string | null;
  rejectionReason?: string | null;
  moderationStatus?: string;
  authoringPolicyVersion?: string;
  offers: CampaignOwnerOffer[];
}

export interface CampaignPriceGuidance {
  currency: string;
  minimumPrice: number;
  guidance: string;
}

export interface CampaignDraftPreview {
  id: string;
  title: string;
  status: string;
  draftRevision: number;
  purchasable: false;
  previewWatermark: 'DRAFT';
  products: unknown[];
}

export async function getCampaignOwnerDetail(campaignId: string) {
  return apiClient.get<CampaignOwnerDetail>(`/campaigns/${campaignId}`);
}

export async function updateCampaignBasics(
  campaignId: string,
  input: {
    expectedRevision: number;
    title?: string;
    slug?: string;
    description?: string | null;
    story?: string | null;
    goalAmount?: number | null;
    startDate?: string | null;
    endDate?: string | null;
  },
) {
  return apiClient.patch<CampaignOwnerDetail>(`/campaigns/${campaignId}`, input);
}

export async function addCampaignOffer(
  campaignId: string,
  input: {
    expectedRevision: number;
    productId: string;
    designId: string;
    price: number;
  },
) {
  return apiClient.post<CampaignOwnerDetail>(
    `/campaigns/${campaignId}/offers`,
    input,
  );
}

export async function updateCampaignOffer(
  campaignId: string,
  offerId: string,
  input: {
    expectedRevision: number;
    designId?: string;
    price?: number;
  },
) {
  return apiClient.patch<CampaignOwnerDetail>(
    `/campaigns/${campaignId}/offers/${offerId}`,
    input,
  );
}

export async function removeCampaignOffer(
  campaignId: string,
  offerId: string,
  input: { expectedRevision: number },
) {
  return apiClient.delete<CampaignOwnerDetail>(
    `/campaigns/${campaignId}/offers/${offerId}`,
    input,
  );
}

export async function getCampaignPriceGuidance(
  campaignId: string,
  productId: string,
  designId: string,
) {
  const qs = new URLSearchParams({ productId, designId });
  return apiClient.get<CampaignPriceGuidance>(
    `/campaigns/${campaignId}/price-guidance?${qs.toString()}`,
  );
}

export async function getCampaignDraftPreview(campaignId: string) {
  return apiClient.get<CampaignDraftPreview>(`/campaigns/${campaignId}/preview`);
}

export async function submitCampaignForReview(campaignId: string) {
  return apiClient.post<CampaignOwnerDetail>(
    `/campaigns/${campaignId}/submit-for-review`,
  );
}
