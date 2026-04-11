import { apiClient } from './api';
import type { CustomerOrder } from './dashboard';

export interface QuoteLineItem {
  variantId: string;
  quantity: number;
  designId?: string;
  campaignId?: string;
}

export interface OrderQuote {
  currency: string;
  subtotalAmount: number;
  discountAmount: number;
  shippingFee: number;
  vatAmount: number;
  totalAmount: number;
}

export interface CustomerOrderDetail extends CustomerOrder {
  subtotalAmount: number;
  shippingFee: number;
  discountAmount: number;
  expiresAt?: string | null;
  paymentReference?: string | null;
  shippingAddress?: {
    id: string;
    addressLine1: string;
    addressLine2?: string | null;
    city: string;
    state: string;
    country?: string | null;
    phone?: string | null;
    recipientName?: string | null;
  } | null;
}

export async function quoteOrder(input: {
  shippingAddressId: string;
  items: QuoteLineItem[];
}) {
  return apiClient.post<OrderQuote>('/orders/quote', input);
}

export async function createOrder(input: {
  shippingAddressId: string;
  items: QuoteLineItem[];
  idempotencyKey?: string;
}) {
  return apiClient.post<CustomerOrderDetail>('/orders', input);
}

export async function initiateOrderPayment(
  orderId: string,
  customerEmail?: string,
) {
  return apiClient.post<{
    authorizationUrl: string;
    reference: string;
    accessCode: string;
  }>(`/orders/${orderId}/initiate-payment`, { customerEmail });
}

export async function getCustomerOrderDetail(orderId: string) {
  return apiClient.get<CustomerOrderDetail>(`/orders/${orderId}`);
}
