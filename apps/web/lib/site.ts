const LOCAL_WEB_ORIGIN = 'http://localhost:3000';

/**
 * Canonical public web origin for metadata, sitemap and robots.
 * Never derived from request headers (TTW-071).
 */
export function webPublicOrigin(): string {
  const configured =
    process.env.NEXT_PUBLIC_WEB_URL?.trim() || process.env.WEB_PUBLIC_ORIGIN?.trim();
  const origin = configured && configured.length > 0 ? configured : LOCAL_WEB_ORIGIN;
  return origin.replace(/\/$/, '');
}

export function absoluteWebUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${webPublicOrigin()}${normalizedPath}`;
}

export const customerAppUrl = process.env.NEXT_PUBLIC_CUSTOMER_APP_URL || 'http://localhost:3002';

export const adminAppUrl = process.env.NEXT_PUBLIC_ADMIN_APP_URL || 'http://localhost:3003';

export function customerAppPath(path = '') {
  return `${customerAppUrl}${path}`;
}

export function adminAppPath(path = '') {
  return `${adminAppUrl}${path}`;
}

export function webRegisterWithNext(nextPath: string) {
  return `/auth/register?next=${encodeURIComponent(nextPath)}`;
}

export function webLoginWithNext(nextPath: string) {
  return `/auth/login?next=${encodeURIComponent(nextPath)}`;
}
