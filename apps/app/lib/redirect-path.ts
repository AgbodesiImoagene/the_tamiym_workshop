/**
 * Validates `next` from query strings so open redirects cannot point off-site.
 */
export function getSafeRedirectPath(
  next: string | null | undefined,
  fallback = '/dashboard'
): string {
  if (!next || typeof next !== 'string') return fallback;
  const trimmed = next.trim();
  if (!trimmed.startsWith('/') || trimmed.startsWith('//')) return fallback;
  return trimmed;
}
