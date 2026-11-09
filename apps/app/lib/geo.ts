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
