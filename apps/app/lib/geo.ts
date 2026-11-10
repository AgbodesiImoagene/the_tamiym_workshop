import { apiClient } from './api';

/** TTW-087: states and LGAs offered in the address forms. */
export interface GeoState {
  code: string;
  name: string;
}

export interface GeoLga {
  id: string;
  name: string;
}

export async function getGeoStates() {
  return apiClient.get<GeoState[]>('/geo/states');
}

export async function getGeoLgas(stateCode: string) {
  return apiClient.get<GeoLga[]>(`/geo/states/${encodeURIComponent(stateCode)}/lgas`);
}

/**
 * TTW-192: finds the listed state of a saved address. The code wins; an address saved
 * before the lists existed has only its text, which is matched by name.
 */
export function matchSavedState(
  states: GeoState[],
  saved: { state?: string | null; stateCode?: string | null }
): GeoState | undefined {
  if (saved.stateCode) return states.find((item) => item.code === saved.stateCode);
  const typed = (saved.state ?? '').trim().toLowerCase();
  return typed ? states.find((item) => item.name.toLowerCase() === typed) : undefined;
}

/**
 * TTW-193: the `lgaId` part of an address save. An LGA left empty on an address that had
 * one is an explicit "remove it" (null); on an address without one there is nothing to
 * send. The API keeps the saved LGA when `lgaId` is absent.
 */
export function lgaIdPayload(formLgaId: string, savedLgaId: string | null | undefined) {
  if (formLgaId) return { lgaId: formLgaId };
  return savedLgaId ? { lgaId: null } : {};
}
