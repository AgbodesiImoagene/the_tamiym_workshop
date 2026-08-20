/**
 * Redact design-share bearers from request URLs before logging (TTW-026).
 * Matches `/v1/public/designs/<token>` and `/public/designs/<token>`.
 */
export function redactPublicDesignShareUrl(
  url: string | undefined,
): string | undefined {
  if (!url) return url;
  return url.replace(
    /(\/(?:v1\/)?public\/designs\/)([^/?#]+)/gi,
    '$1[REDACTED]',
  );
}
