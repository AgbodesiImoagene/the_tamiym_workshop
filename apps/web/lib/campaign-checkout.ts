import { apiClient } from './api';
import type { CampaignCartLine } from './campaign-cart';

export interface CampaignQuoteLineItem {
  variantId: string;
  quantity: number;
  designId?: string;
}

export interface CampaignOrderQuote {
  currency: string;
  subtotalAmount: number;
  discountAmount: number;
  shippingFee: number;
  vatAmount: number;
  totalAmount: number;
  items: Array<{
    variantId: string;
    quantity: number;
    unitFinalPrice: number;
    lineTotal: number;
  }>;
}

export interface CustomerOrderDetail {
  policyVersion?: string;
  id: string;
  status: string;
  paymentStatus: string;
  currency: string;
  totalAmount: number;
  subtotalAmount?: number;
  shippingFee?: number;
  discountAmount?: number;
  campaignId?: string | null;
  expiresAt?: string | null;
  paymentReference?: string | null;
  paymentRetryEligible?: boolean;
  items: Array<{
    id: string;
    quantity: number;
    productNameSnapshot: string;
    variantDisplaySnapshot: string;
  }>;
}

export function cartLinesToQuoteItems(lines: CampaignCartLine[]): CampaignQuoteLineItem[] {
  return lines.map((line) => ({
    variantId: line.variantId,
    designId: line.designId,
    quantity: line.quantity,
  }));
}

export async function quoteCampaignOrder(
  campaignId: string,
  input: { shippingAddressId: string; items: CampaignQuoteLineItem[] }
) {
  return apiClient.post<CampaignOrderQuote>(`/campaigns/${campaignId}/orders/quote`, input);
}

export async function createCampaignOrder(
  campaignId: string,
  input: {
    shippingAddressId: string;
    items: CampaignQuoteLineItem[];
    idempotencyKey: string;
  }
) {
  return apiClient.post<CustomerOrderDetail>(`/campaigns/${campaignId}/orders`, input);
}

export async function initiateOrderPayment(orderId: string, customerEmail?: string) {
  return apiClient.post<{
    authorizationUrl: string;
    reference: string;
    accessCode: string;
    attemptOutcome?: string;
  }>(`/orders/${orderId}/initiate-payment`, { customerEmail });
}

export async function getOwnedOrder(orderId: string) {
  return apiClient.get<CustomerOrderDetail>(`/orders/${orderId}`);
}
