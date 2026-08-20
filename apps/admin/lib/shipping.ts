import { CurrencyCode, ShippingRateProvider } from '@tamiym/types';
import { apiClient } from './api';

export interface GeoState {
  code: string;
  name: string;
}

export interface GeoLga {
  id: string;
  stateCode: string;
  name: string;
}

export interface AdminShippingZoneArea {
  id: string;
  zoneId: string;
  stateCode: string;
  lgaId: string | null;
  state: {
    code: string;
    name: string;
  };
  lga: {
    id: string;
    name: string;
  } | null;
}

export interface AdminShippingZoneRule {
  id: string;
  zoneId: string;
  countryCode: string;
  matchType: string;
  matchValue: string;
  matchContext: string | null;
  priority: number;
  isActive: boolean;
}

export interface AdminShippingRate {
  id: string;
  zoneId: string;
  provider: ShippingRateProvider;
  serviceLevel: string;
  currency: CurrencyCode;
  flatFee: number;
  priority: number;
  isActive: boolean;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  minDeliveryDays: number | null;
  maxDeliveryDays: number | null;
}

export interface AdminShippingZone {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  areas: AdminShippingZoneArea[];
  rules: AdminShippingZoneRule[];
  rates: AdminShippingRate[];
}

export async function getAdminShippingZones() {
  return apiClient.get<AdminShippingZone[]>('/admin/shipping-zones');
}

export async function getAdminShippingZone(id: string) {
  return apiClient.get<AdminShippingZone>(`/admin/shipping-zones/${id}`);
}

export async function createAdminShippingZone(input: { name: string; isActive?: boolean }) {
  return apiClient.post<AdminShippingZone>('/admin/shipping-zones', input);
}

export async function updateAdminShippingZone(
  id: string,
  input: { name?: string; isActive?: boolean }
) {
  return apiClient.patch<AdminShippingZone>(`/admin/shipping-zones/${id}`, input);
}

export async function getAdminGeoStates() {
  return apiClient.get<GeoState[]>('/admin/geo/states');
}

export async function getAdminGeoLgas(stateCode: string) {
  return apiClient.get<GeoLga[]>(`/admin/geo/states/${encodeURIComponent(stateCode)}/lgas`);
}

export async function createAdminShippingZoneArea(
  zoneId: string,
  input: { stateCode: string; lgaId?: string | null }
) {
  return apiClient.post<AdminShippingZoneArea>(`/admin/shipping-zones/${zoneId}/areas`, input);
}

export async function createAdminShippingRate(
  zoneId: string,
  input: {
    provider?: ShippingRateProvider;
    serviceLevel?: string;
    currency?: CurrencyCode;
    flatFee: number;
    priority?: number;
    isActive?: boolean;
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
    minDeliveryDays?: number | null;
    maxDeliveryDays?: number | null;
  }
) {
  return apiClient.post<AdminShippingRate>(`/admin/shipping-zones/${zoneId}/rates`, input);
}
