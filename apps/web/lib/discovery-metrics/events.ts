import { DISCOVERY_EVENTS_VERSION } from './catalogue';
import { classifyDocumentReferrer, extractReferrerHost } from './referrers';
import type { DiscoveryEvent, DiscoveryEventName } from './types';

const BLOCKED_PATH_PREFIXES = ['/auth/', '/orders/', '/verify-email'];

export function normalizeDiscoveryPath(path: string): string {
  const trimmed = path.trim() || '/';
  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

export function isDiscoverableAnalyticsPath(path: string): boolean {
  const normalized = normalizeDiscoveryPath(path);
  return !BLOCKED_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export function inferDeviceClass(
  userAgent: string | null | undefined
): 'mobile' | 'desktop' | 'unknown' {
  if (!userAgent?.trim()) {
    return 'unknown';
  }
  return /mobile|android|iphone|ipad|ipod/i.test(userAgent) ? 'mobile' : 'desktop';
}

export function buildDiscoveryEvent(input: {
  name: DiscoveryEventName;
  path: string;
  referrer?: string | null;
  currentOrigin?: string;
  queryCluster?: string;
  userAgent?: string | null;
}): DiscoveryEvent | null {
  const path = normalizeDiscoveryPath(input.path);
  if (!isDiscoverableAnalyticsPath(path)) {
    return null;
  }

  const referrerClass = classifyDocumentReferrer(input.referrer, input.currentOrigin);

  return {
    name: input.name,
    version: DISCOVERY_EVENTS_VERSION,
    occurredAt: new Date().toISOString(),
    path,
    referrerClass,
    referrerHost: extractReferrerHost(input.referrer),
    queryCluster: input.queryCluster,
    deviceClass: inferDeviceClass(input.userAgent),
    consentGranted: true,
  };
}

export function validateDiscoveryEvent(event: DiscoveryEvent): string[] {
  const errors: string[] = [];

  if (!event.version.startsWith('discovery-events/')) {
    errors.push('Discovery event version must use discovery-events namespace');
  }
  if (!event.path.startsWith('/')) {
    errors.push('Discovery event path must be site-relative');
  }
  if (!isDiscoverableAnalyticsPath(event.path)) {
    errors.push(`Discovery events must not target private path "${event.path}"`);
  }
  if (event.referrerHost && /[/?#]/.test(event.referrerHost)) {
    errors.push('referrerHost must be hostname only');
  }

  return errors;
}

export function serializeDiscoveryEvent(event: DiscoveryEvent): string {
  return JSON.stringify(event);
}
