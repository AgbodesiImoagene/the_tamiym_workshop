import { CampaignStatus, OrderStatus, PaymentStatus, PayoutStatus } from '@tamiym/types';
import { apiClient } from './api';

export type AdminCampaignStatus = CampaignStatus | 'REVIEW';

export interface AdminOverview {
  ordersCount: number;
  ordersPaidCount: number;
  totalRevenue: number;
  currency: string;
  campaignsCount: number;
  campaignsActiveCount: number;
}

export interface AdminOrder {
  id: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalAmount: number;
  currency: string;
  createdAt: string;
  user: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  };
}

export interface AdminOrderDetail extends AdminOrder {
  subtotalAmount: number;
  shippingFee: number;
  discountAmount: number;
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
    design?: {
      id: string;
      name: string;
    } | null;
  }>;
  refunds?: Array<{
    id: string;
    amount: number;
    currency: string;
    status: string;
    reason?: string | null;
    providerRef?: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
}

export interface AdminCampaign {
  id: string;
  title: string;
  slug: string;
  status: AdminCampaignStatus;
  currency: string;
  goalAmount?: number | null;
  currentAmount?: number | null;
  rejectionReason?: string | null;
  moderationStatus?: string | null;
  moderationNotes?: string | null;
  payoutModeOverride?: string | null;
  organizer?: {
    id: string;
    email: string;
    firstName?: string | null;
    lastName?: string | null;
  };
  products?: Array<{
    id: string;
    product: {
      id: string;
      name: string;
    };
  }>;
}

export interface AdminProduct {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
}

export interface AdminPayoutOverview {
  payoutRunsCount: number;
  payoutsCount: number;
  pendingApprovalRunsCount: number;
  failedPayoutsCount: number;
}

export interface AdminMoneyMetrics {
  currency: string;
  grossCurrentAmount: number;
  eligibleLedgerBalance: number;
  totalPaidOut: number;
  pendingManualAdjustmentsCount: number;
}

export interface AdminCampaignSnapshot {
  campaignId: string;
  goalAmount?: number | null;
  currentAmount: number;
  eligibleBalance: number;
  paidOrdersCount: number;
  lastPayoutAt?: string | null;
  currency: string;
}

export interface AdminPayoutRun {
  id: string;
  status: string;
  mode: string;
  scheduledFor: string;
  cutoffAt: string;
  approvedAt?: string | null;
  executedAt?: string | null;
  payouts: Array<{
    id: string;
    campaignId: string;
    amount: number;
    status: PayoutStatus;
    providerRef?: string | null;
  }>;
}

export interface AdminPayoutRunsResponse {
  runs: AdminPayoutRun[];
  total: number;
}

export interface AdminPayoutRunPreview {
  cutoffAt?: string;
  minimumPayoutAmount?: number;
  items: Array<{
    campaignId: string;
    campaignTitle: string;
    organizerId: string;
    eligibleBalance: number;
    currency: string;
    payoutProfileId: string;
  }>;
  totalAmount: number;
}

export interface SiteSettings {
  id: string;
  vatRate: number;
  pricesIncludeVat: boolean;
  vatAppliesToShipping: boolean;
  currency: string;
  payoutMode: string;
  payoutCadenceDays: number;
  payoutSettlementHoldDays: number;
  minimumPayoutAmount?: number | null;
  autoRetryFailedPayouts: boolean;
}

export async function getAdminOverview() {
  return apiClient.get<AdminOverview>('/admin/analytics/overview');
}

export async function getAdminOrders() {
  return apiClient.get<AdminOrder[]>('/admin/orders');
}

export async function getAdminOrdersByStatus(status?: string) {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiClient.get<AdminOrder[]>(`/admin/orders${suffix}`);
}

export async function getAdminOrder(id: string) {
  return apiClient.get<AdminOrderDetail>(`/admin/orders/${id}`);
}

export async function updateAdminOrderStatus(id: string, status: string) {
  return apiClient.patch<AdminOrderDetail>(`/admin/orders/${id}`, { status });
}

export async function createAdminRefund(
  id: string,
  amount: number,
  reason?: string,
  idempotencyKey?: string,
) {
  return apiClient.post<{
    id: string;
    orderId: string;
    status: string;
    amount: number;
    providerRef?: string | null;
  }>(`/admin/orders/${id}/refund`, {
    amount,
    reason,
    idempotencyKey: idempotencyKey ?? `admin-refund:${id}:${amount}:${Date.now()}`,
  });
}

export async function getAdminCampaigns() {
  return apiClient.get<AdminCampaign[]>('/admin/campaigns');
}

export async function getAdminCampaignsByStatus(status?: string) {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiClient.get<AdminCampaign[]>(`/admin/campaigns${suffix}`);
}

export async function activateAdminCampaign(id: string) {
  return apiClient.post<AdminCampaign>(`/admin/campaigns/${id}/activate`);
}

export async function rejectAdminCampaign(id: string, rejectionReason: string, notes?: string) {
  return apiClient.post<AdminCampaign>(`/admin/campaigns/${id}/reject`, {
    rejectionReason,
    notes,
  });
}

export async function updateAdminCampaignStatus(id: string, status: string) {
  return apiClient.patch<AdminCampaign>(`/admin/campaigns/${id}/status`, {
    status,
  });
}

export async function updateAdminCampaignPayoutPolicy(
  id: string,
  payoutModeOverride: string | null
) {
  return apiClient.patch<AdminCampaign>(`/admin/campaigns/${id}/payout-policy`, {
    payoutModeOverride,
  });
}

export async function getAdminCampaignSnapshot(campaignId: string) {
  const snapshot = await apiClient.get<{
    campaignId: string;
    goalAmount?: number | null;
    currentAmountGross: number;
    eligibleBalanceLedger: number;
    paidOrdersCount: number;
    lastPayoutAt?: string | null;
    currency: string;
  }>(`/admin/analytics/campaigns/${campaignId}/snapshot`);

  return {
    campaignId: snapshot.campaignId,
    goalAmount: snapshot.goalAmount,
    currentAmount: snapshot.currentAmountGross,
    eligibleBalance: snapshot.eligibleBalanceLedger,
    paidOrdersCount: snapshot.paidOrdersCount,
    lastPayoutAt: snapshot.lastPayoutAt,
    currency: snapshot.currency,
  } satisfies AdminCampaignSnapshot;
}

export async function getAdminProducts() {
  return apiClient.get<AdminProduct[]>('/admin/products');
}

export async function getAdminPayoutOverview() {
  const response = await apiClient.get<{
    payoutRunsTotal: number;
    payoutRunsPendingApproval: number;
    payoutsFailed: number;
    payoutsSucceeded: number;
  }>('/admin/analytics/payouts');

  return {
    payoutRunsCount: response.payoutRunsTotal,
    payoutsCount: response.payoutsFailed + response.payoutsSucceeded,
    pendingApprovalRunsCount: response.payoutRunsPendingApproval,
    failedPayoutsCount: response.payoutsFailed,
  } satisfies AdminPayoutOverview;
}

export async function getAdminMoneyMetrics() {
  const response = await apiClient.get<{
    campaignsGrossRaisedSum: number;
    ledgerEligibleTotal: number;
    payoutsSucceededAmount: number;
    manualAdjustmentsPendingApproval: number;
    currency: string;
  }>('/admin/analytics/money-metrics');

  return {
    currency: response.currency,
    grossCurrentAmount: response.campaignsGrossRaisedSum,
    eligibleLedgerBalance: response.ledgerEligibleTotal,
    totalPaidOut: response.payoutsSucceededAmount,
    pendingManualAdjustmentsCount: response.manualAdjustmentsPendingApproval,
  } satisfies AdminMoneyMetrics;
}

export async function previewAdminPayoutRun(cutoffAt?: string) {
  const suffix = cutoffAt ? `?cutoffAt=${encodeURIComponent(cutoffAt)}` : '';
  return apiClient.get<AdminPayoutRunPreview>(`/admin/payout-runs/preview${suffix}`);
}

export async function getAdminPayoutRuns(status?: string) {
  const suffix = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiClient.get<AdminPayoutRunsResponse>(`/admin/payout-runs${suffix}`);
}

export async function createAdminPayoutRun(input: {
  scheduledFor: string;
  cutoffAt: string;
  mode: string;
}) {
  return apiClient.post('/admin/payout-runs', input);
}

export async function approveAdminPayoutRun(id: string) {
  return apiClient.post(`/admin/payout-runs/${id}/approve`);
}

export async function executeAdminPayoutRun(id: string) {
  return apiClient.post(`/admin/payout-runs/${id}/execute`);
}

export async function retryAdminPayout(payoutId: string) {
  return apiClient.post(`/admin/payout-runs/payouts/${payoutId}/retry`);
}

export async function initiateAdminCampaignPayout(
  campaignId: string,
  amount: number,
  reason?: string
) {
  return apiClient.post(`/admin/campaigns/${campaignId}/payouts`, {
    amount,
    reason,
  });
}

export async function requestAdminManualAdjustment(
  campaignId: string,
  amount: number,
  reason: string
) {
  return apiClient.post(`/admin/campaigns/${campaignId}/payouts/manual-adjustment`, {
    amount,
    reason,
  });
}

export async function approveAdminManualAdjustment(payoutId: string, approvalReason?: string) {
  return apiClient.post(`/admin/payouts/${payoutId}/approve-manual`, {
    approvalReason,
  });
}

export async function getAdminSiteSettings() {
  return apiClient.get<SiteSettings>('/admin/site-settings');
}
