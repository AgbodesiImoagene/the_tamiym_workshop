import type { OpenAPIObject } from '@nestjs/swagger';

const STABLE_SORT_ARRAY_KEYS = new Set(['tags', 'required', 'enum']);

/**
 * Nest Swagger emits bearer/cookie schemes with extra fields that fail OpenAPI 3
 * validation. Repair them to the canonical shapes without changing runtime auth.
 */
export function repairSecuritySchemes(document: OpenAPIObject): OpenAPIObject {
  const schemes = document.components?.securitySchemes;
  if (!schemes) return document;

  for (const [key, raw] of Object.entries(schemes)) {
    if (!raw || typeof raw !== 'object' || '$ref' in raw) continue;
    const scheme = raw as unknown as Record<string, unknown>;

    if (scheme.type === 'http' && scheme.scheme === 'bearer') {
      const repaired: Record<string, unknown> = {
        type: 'http',
        scheme: 'bearer',
      };
      if (typeof scheme.bearerFormat === 'string') {
        repaired.bearerFormat = scheme.bearerFormat;
      }
      if (typeof scheme.description === 'string') {
        repaired.description = scheme.description;
      }
      schemes[key] = repaired as unknown as (typeof schemes)[string];
      continue;
    }

    const schemeIn =
      typeof scheme.in === 'string' ? scheme.in.toLowerCase() : '';
    if (scheme.type === 'http' && schemeIn === 'cookie') {
      schemes[key] = {
        type: 'apiKey',
        in: 'cookie',
        name:
          typeof scheme.name === 'string'
            ? scheme.name
            : key === 'cookie'
              ? 'access_token'
              : key,
      } as (typeof schemes)[string];
    }
  }

  return document;
}

/**
 * Recursively sort object keys for deterministic JSON output.
 * Selected arrays are sorted lexicographically when element order is not semantic.
 */
export function normalizeOpenApiDocument<T>(value: T): T {
  return normalizeValue(value) as T;
}

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    const normalized = value.map((entry) => normalizeValue(entry));
    return normalized;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  const record = value as Record<string, unknown>;
  const normalized: Record<string, unknown> = {};

  for (const key of Object.keys(record).sort()) {
    const child = record[key];
    if (STABLE_SORT_ARRAY_KEYS.has(key) && Array.isArray(child)) {
      normalized[key] = [...child]
        .map((entry) => normalizeValue(entry))
        .sort((left, right) => String(left).localeCompare(String(right), 'en'));
      continue;
    }

    normalized[key] = normalizeValue(child);
  }

  return normalized;
}

/** Serialize a normalized OpenAPI document with a trailing newline. */
export function serializeOpenApiDocument(document: OpenAPIObject): string {
  const repaired = repairSecuritySchemes(structuredClone(document));
  const normalized = normalizeOpenApiDocument(repaired);
  return `${JSON.stringify(normalized, null, 2)}\n`;
}
