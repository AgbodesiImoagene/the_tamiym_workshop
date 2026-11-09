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
 * The state selected in the form: the saved code when there is one, otherwise
 * the saved state text matched to the list by name. Undefined means "not in
 * our list", so the customer must choose one.
 */
export function findSelectedState(
  states: GeoState[] | undefined,
  stateCode: string,
  stateText: string
): GeoState | undefined {
  if (!states) return undefined;
  if (stateCode) return states.find((item) => item.code === stateCode);
  const typed = stateText.trim().toLowerCase();
  return typed ? states.find((item) => item.name.toLowerCase() === typed) : undefined;
}

/** Form fields that change with the state. Another state means another LGA list. */
export function stateFormPatch(states: GeoState[] | undefined, code: string) {
  const next = states?.find((item) => item.code === code);
  return { state: next?.name ?? '', stateCode: next?.code ?? '', lgaId: '' };
}
