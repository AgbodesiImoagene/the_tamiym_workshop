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
