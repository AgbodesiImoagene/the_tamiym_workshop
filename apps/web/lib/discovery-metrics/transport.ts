import { canCollectDiscoveryAnalytics, readDiscoveryConsent } from './consent';
import { buildDiscoveryEvent, serializeDiscoveryEvent, validateDiscoveryEvent } from './events';
import type { DiscoveryEvent, DiscoveryEventName } from './types';

export function dispatchDiscoveryEvent(event: DiscoveryEvent): boolean {
  const errors = validateDiscoveryEvent(event);
  if (errors.length > 0) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn('Discovery event rejected:', errors.join('; '));
    }
    return false;
  }

  const endpoint = process.env.NEXT_PUBLIC_DISCOVERY_ANALYTICS_ENDPOINT;
  const payload = serializeDiscoveryEvent(event);

  if (endpoint && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    const blob = new Blob([payload], { type: 'application/json' });
    return navigator.sendBeacon(endpoint, blob);
  }

  if (process.env.NODE_ENV !== 'production') {
    console.debug('[discovery-analytics]', payload);
  }

  return true;
}

export function trackDiscoveryEvent(input: {
  name: DiscoveryEventName;
  path: string;
  referrer?: string | null;
  currentOrigin?: string;
  queryCluster?: string;
}): boolean {
  if (!canCollectDiscoveryAnalytics(readDiscoveryConsent())) {
    return false;
  }

  const event = buildDiscoveryEvent({
    ...input,
    userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
  });

  if (!event) {
    return false;
  }

  return dispatchDiscoveryEvent(event);
}
