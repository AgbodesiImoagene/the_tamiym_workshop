import { request, type APIRequestContext } from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { originForSurface } from './api';
import { urls } from './identities';

const authDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../.auth');

/**
 * API client acting as the seeded admin, for creating and removing the data a
 * test needs through the real admin routes (no mocks).
 *
 * It reuses the admin session saved by the setup project. Admin writes need the
 * surface CSRF token in `X-CSRF-Token`; `auth/me` returns it for the session.
 */
export async function createAdminApi(): Promise<APIRequestContext> {
  const bootstrap = await request.newContext({
    baseURL: `${urls.api}/v1/`,
    storageState: path.join(authDir, 'admin.json'),
    extraHTTPHeaders: { Accept: 'application/json', Origin: originForSurface('ADMIN') },
  });
  const me = await bootstrap.get('auth/me');
  if (!me.ok()) {
    throw new Error(`Admin session is not valid: auth/me returned ${me.status()}`);
  }
  const { csrf_token: csrfToken } = (await me.json()) as { csrf_token?: string };
  if (!csrfToken) throw new Error('auth/me returned no csrf_token for the admin session');
  const state = await bootstrap.storageState();
  await bootstrap.dispose();

  return request.newContext({
    baseURL: `${urls.api}/v1/`,
    storageState: state,
    extraHTTPHeaders: {
      Accept: 'application/json',
      Origin: originForSurface('ADMIN'),
      'X-CSRF-Token': csrfToken,
    },
  });
}

export interface TestShippingZone {
  id: string;
  name: string;
}

/** Creates a shipping zone through `POST /admin/shipping-zones`. */
export async function createShippingZone(
  admin: APIRequestContext,
  name: string
): Promise<TestShippingZone> {
  const res = await admin.post('admin/shipping-zones', { data: { name, isActive: true } });
  if (!res.ok()) {
    throw new Error(`Creating shipping zone "${name}" failed: ${res.status()} ${await res.text()}`);
  }
  const body = (await res.json()) as { id: string };
  return { id: body.id, name };
}

/** Removes a zone (and, by cascade, its areas) through `DELETE /admin/shipping-zones/:id`. */
export async function deleteShippingZone(admin: APIRequestContext, id: string): Promise<void> {
  const res = await admin.delete(`admin/shipping-zones/${id}`);
  // 404: already gone (the test removed it). Anything else is a real cleanup failure.
  if (!res.ok() && res.status() !== 404) {
    throw new Error(`Deleting shipping zone ${id} failed: ${res.status()} ${await res.text()}`);
  }
}

/** The areas the zone has right now, read from the real API. */
export async function listZoneAreas(admin: APIRequestContext, zoneId: string): Promise<unknown[]> {
  const res = await admin.get(`admin/shipping-zones/${zoneId}/areas`);
  if (!res.ok()) {
    throw new Error(`Listing areas of zone ${zoneId} failed: ${res.status()} ${await res.text()}`);
  }
  return (await res.json()) as unknown[];
}
