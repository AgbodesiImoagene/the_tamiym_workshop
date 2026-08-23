/**
 * Dev-only bypass for mandatory ADMIN MFA (TTW-023).
 *
 * When enabled, ADMIN password login mints a session without enroll/challenge,
 * and JWT validation skips the MFA-enrolled check. Never enable in production.
 */
export function isAdminMfaBypassEnabled(
  config?: Record<string, unknown>,
): boolean {
  const raw =
    config?.AUTH_ADMIN_MFA_DISABLED ?? process.env.AUTH_ADMIN_MFA_DISABLED;
  if (raw === undefined || raw === null) {
    return false;
  }
  if (typeof raw === 'boolean') {
    return raw;
  }
  if (typeof raw === 'number') {
    return raw === 1;
  }
  if (typeof raw === 'string') {
    const normalized = raw.trim().toLowerCase();
    return normalized === 'true' || normalized === '1';
  }
  return false;
}
