import { apiClient } from './api';

export interface BankOption {
  code: string;
  name: string;
}

export interface PayoutProfile {
  id: string;
  label?: string | null;
  bankCode: string;
  bankName?: string | null;
  accountName: string;
  accountNumber: string;
  isDefault: boolean;
  createdAt?: string;
}

export interface CreatePayoutProfileInput {
  label?: string;
  bankCode: string;
  bankName?: string;
  accountName: string;
  accountNumber: string;
}

export async function getBanks() {
  return apiClient.get<BankOption[]>('/banks');
}

export async function getPayoutProfiles() {
  return apiClient.get<PayoutProfile[]>('/payout-profiles');
}

export async function createPayoutProfile(input: CreatePayoutProfileInput) {
  return apiClient.post<PayoutProfile>('/payout-profiles', input);
}
