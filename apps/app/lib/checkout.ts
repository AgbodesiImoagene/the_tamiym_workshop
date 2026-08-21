import { apiClient } from './api';
import type { OrderStatus, PaymentStatus } from '@tamiym/types';

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

export interface CustomerOrderOptionPresentation {
  option: string;
  optionCode: string;
  value: string;
  valueCode: string;
}

export interface CustomerOrderItemDetail {
  id: string;
  productId: string;
  variantId: string;
  designId?: string | null;
  campaignId?: string | null;
  quantity: number;
  unitFinalPrice: number;
  lineTotal: number;
  productNameSnapshot: string;
  variantDisplaySnapshot: string;
  optionPresentationSnapshot?: CustomerOrderOptionPresentation[] | null;
  snapshotSource: string;
  snapshotVersion: number;
  legacySnapshotDisclosure?: boolean;
}

export interface CustomerOrderShippingSnapshot {
  recipientName?: string | null;
  phone?: string | null;
  line1: string;
  line2?: string | null;
  city: string;
  state: string;
  postalCode?: string | null;
  country: string;
  landmark?: string | null;
}

export interface CustomerOrderPaymentSummary {
  id: string;
  status: PaymentStatus;
  amount: number;
  currency: string;
  providerRef?: string | null;
  createdAt: string;
  expiresAt?: string | null;
}

export interface CustomerOrderRefundSummary {
  id: string;
  status: string;
  amount: number;
  currency: string;
  reason?: string | null;
  createdAt: string;
}

/** Explicit customer order-detail contract (TTW-033). */
export interface CustomerOrderDetail {
  policyVersion: string;
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  currency: string;
  subtotalAmount: number;
  shippingFee: number;
  discountAmount: number;
  vatAmount?: number | null;
  totalAmount: number;
  createdAt: string;
  updatedAt: string;
  expiresAt?: string | null;
  cancelledAt?: string | null;
  paymentReference?: string | null;
  items: CustomerOrderItemDetail[];
  shipping: CustomerOrderShippingSnapshot;
  payments: CustomerOrderPaymentSummary[];
  refunds: CustomerOrderRefundSummary[];
  refundedAmountConfirmed: number;
  campaign?: { id: string; title: string; slug: string } | null;
  campaignId?: string | null;
  paymentRetryEligible: boolean;
  shipment?: CustomerShipmentSummary | null;
  shipmentPlaceholder?: string | null;
}

export interface CustomerShipmentEvent {
  id: string;
  type: string;
  occurredAt: string;
  customerMessage?: string | null;
  exceptionCode?: string | null;
}

export interface CustomerShipmentSummary {
  policyVersion: string;
  id: string;
  status: string;
  carrierName: string;
  trackingNumber?: string | null;
  trackingUrl?: string | null;
  estimatedDeliveryAt?: string | null;
  exceptionCode?: string | null;
  exceptionMessage?: string | null;
  events: CustomerShipmentEvent[];
}

export async function quoteOrder(input: { shippingAddressId: string; items: QuoteLineItem[] }) {
  return apiClient.post<OrderQuote>('/orders/quote', input);
}

export async function createOrder(input: {
  shippingAddressId: string;
  items: QuoteLineItem[];
  idempotencyKey?: string;
}) {
  return apiClient.post<{ id: string }>('/orders', input);
}

export async function initiateOrderPayment(orderId: string, customerEmail?: string) {
  return apiClient.post<{
    authorizationUrl: string;
    reference: string;
    accessCode: string;
  }>(`/orders/${orderId}/initiate-payment`, { customerEmail });
}

export async function getCustomerOrderDetail(orderId: string) {
  return apiClient.get<CustomerOrderDetail>(`/orders/${orderId}`);
}
