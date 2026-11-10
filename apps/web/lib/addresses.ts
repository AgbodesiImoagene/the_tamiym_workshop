import { apiClient } from './api';

export interface ShippingAddress {
  id: string;
  addressLine1: string;
  addressLine2?: string | null;
  recipientName?: string | null;
  phone?: string | null;
  city: string;
  state: string;
  stateCode?: string | null;
  lgaId?: string | null;
  postalCode?: string | null;
  country?: string | null;
  landmark?: string | null;
  instructions?: string | null;
  isDefault?: boolean;
}

export interface UpsertAddressInput {
  recipientName?: string;
  phone?: string;
  addressLine1: string;
  addressLine2?: string;
  city: string;
  state: string;
  stateCode?: string;
  // undefined keeps the saved LGA; null removes it (TTW-193).
  lgaId?: string | null;
  country?: string;
  postalCode?: string;
  landmark?: string;
  instructions?: string;
}

export async function getUserAddresses() {
  return apiClient.get<ShippingAddress[]>('/users/addresses');
}

export async function upsertPrimaryAddress(input: UpsertAddressInput) {
  const addresses = await getUserAddresses();
  const existing = addresses.find((address) => address.isDefault) ?? addresses[0];
  const payload = {
    ...input,
    country: input.country || 'Nigeria',
    isDefault: true,
  };

  if (existing) {
    return apiClient.patch<ShippingAddress>(`/users/addresses/${existing.id}`, payload);
  }

  // A new address has no LGA to remove: null means nothing on create.
  const { lgaId, ...createPayload } = payload;
  return apiClient.post<ShippingAddress>('/users/addresses', {
    ...createPayload,
    ...(lgaId ? { lgaId } : {}),
  });
}
