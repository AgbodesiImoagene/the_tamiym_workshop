/**
 * Process role for the shared API image (TTW-063).
 *
 * - `api` — HTTP only (no BullMQ consumers, no cron)
 * - `worker` — BullMQ consumers only
 * - `scheduler` — singleton cron only
 * - `all` — local/dev default (HTTP + workers + cron)
 */

export const API_ROLES = ['api', 'worker', 'scheduler', 'all'] as const;

export type ApiRole = (typeof API_ROLES)[number];

export type ApiCapability = 'http' | 'worker' | 'scheduler';

export function resolveApiRole(
  raw: string | undefined = process.env.API_ROLE,
): ApiRole {
  const value = (raw ?? 'all').trim().toLowerCase();
  if ((API_ROLES as readonly string[]).includes(value)) {
    return value as ApiRole;
  }
  throw new Error(
    `Invalid API_ROLE="${raw ?? ''}". Expected one of: ${API_ROLES.join(', ')}`,
  );
}

export function roleIncludes(
  role: ApiRole,
  capability: ApiCapability,
): boolean {
  if (role === 'all') {
    return true;
  }
  if (capability === 'http') {
    return role === 'api';
  }
  return role === capability;
}

/** BullMQ consumers should autorun only for worker-capable roles outside tests. */
export function shouldAutorunBullProcessors(
  role: ApiRole = resolveApiRole(),
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  if (nodeEnv === 'test') {
    return false;
  }
  return roleIncludes(role, 'worker');
}
