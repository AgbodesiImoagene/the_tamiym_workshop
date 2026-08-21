import { CampaignStatus, OrderStatus, PaymentStatus } from '@tamiym/types';
import { apiClient } from './api';

export interface CustomerOrderListItem {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalAmount: number;
  currency: string;
  createdAt: string;
  expiresAt?: string | null;
  items: Array<{
    id: string;
    quantity: number;
    productNameSnapshot: string;
    variantDisplaySnapshot: string;
    snapshotSource: string;
    unitFinalPrice: number;
  }>;
}

/** @deprecated Prefer CustomerOrderListItem — kept for transitional imports. */
export type CustomerOrder = CustomerOrderListItem;

export interface CustomerCampaign {
  id: string;
  title: string;
  slug: string;
  status: CampaignStatus;
  goalAmount?: number | null;
  currentAmount?: number | null;
  currency: string;
  createdAt: string;
}

export async function getCustomerOrders() {
  return apiClient.get<CustomerOrderListItem[]>('/orders');
}

export async function getCustomerCampaigns() {
  return apiClient.get<CustomerCampaign[]>('/campaigns');
}
