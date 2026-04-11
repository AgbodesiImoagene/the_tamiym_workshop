import { CampaignStatus, OrderStatus, PaymentStatus } from '@tamiym/types';
import { apiClient } from './api';

export interface CustomerOrder {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalAmount: number;
  currency: string;
  createdAt: string;
  items: Array<{
    id: string;
    quantity: number;
    product: {
      id: string;
      name: string;
      slug: string;
    };
    variant: {
      id: string;
      name: string;
      sku: string;
    };
  }>;
}

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
  return apiClient.get<CustomerOrder[]>('/orders');
}

export async function getCustomerCampaigns() {
  return apiClient.get<CustomerCampaign[]>('/campaigns');
}
