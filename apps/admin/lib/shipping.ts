import { CurrencyCode, ShippingRateProvider } from '@tamiym/types';
import { apiClient } from './api';

export interface GeoState {
  code: string;
  name: string;
  isActive: boolean;
}

export interface GeoLga {
  id: string;
  stateCode: string;
  name: string;
  isActive: boolean;
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
  input: { name?: string; isActive?: boolean },
  confirmed = false
) {
  return apiClient.patch<AdminShippingZone>(
    `/admin/shipping-zones/${id}${acknowledge(confirmed)}`,
    input
  );
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

/** TTW-097: code of the 409 sent when a change would leave states without delivery. */
export const SHIPPING_COVERAGE_WOULD_BE_LOST = 'SHIPPING_COVERAGE_WOULD_BE_LOST';

export interface UncoveredState {
  code: string;
  name: string;
}

/** The states a 409 coverage warning names, or null when the error is something else. */
export function getUncoveredStates(error: unknown): UncoveredState[] | null {
  const body = (error as { body?: { code?: string; uncoveredStates?: UncoveredState[] } } | null)
    ?.body;
  if (body?.code !== SHIPPING_COVERAGE_WOULD_BE_LOST) return null;
  return Array.isArray(body.uncoveredStates) ? body.uncoveredStates : [];
}

const acknowledge = (confirmed: boolean) => (confirmed ? '?acknowledgeCoverageLoss=true' : '');

export async function deleteAdminShippingZone(id: string, confirmed = false) {
  return apiClient.delete<void>(`/admin/shipping-zones/${id}${acknowledge(confirmed)}`);
}

export async function deleteAdminShippingZoneArea(
  zoneId: string,
  areaId: string,
  confirmed = false
) {
  return apiClient.delete<void>(
    `/admin/shipping-zones/${zoneId}/areas/${areaId}${acknowledge(confirmed)}`
  );
}

export async function deleteAdminShippingRule(id: string, confirmed = false) {
  return apiClient.delete<void>(`/admin/shipping-rules/${id}${acknowledge(confirmed)}`);
}

export async function updateAdminShippingRate(
  id: string,
  input: {
    serviceLevel?: string;
    flatFee?: number;
    priority?: number;
    isActive?: boolean;
    minDeliveryDays?: number | null;
    maxDeliveryDays?: number | null;
  },
  confirmed = false
) {
  return apiClient.patch<AdminShippingRate>(
    `/admin/shipping-rates/${id}${acknowledge(confirmed)}`,
    input
  );
}

export async function deleteAdminShippingRate(id: string, confirmed = false) {
  return apiClient.delete<void>(`/admin/shipping-rates/${id}${acknowledge(confirmed)}`);
}
