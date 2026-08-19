export function payloadAsRecord(payload: unknown): Record<string, unknown> {
  return payload !== null && typeof payload === 'object'
    ? (payload as Record<string, unknown>)
    : {};
}

/** Coerce JSON/unknown payload fields to a display string without `[object Object]`. */
export function asScalarString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return fallback;
}
