export const DISCOVERY_CONSENT_STORAGE_KEY = 'ttw_discovery_analytics_consent';

export type DiscoveryConsentState = 'granted' | 'denied' | 'unset';

export function readDiscoveryConsent(): DiscoveryConsentState {
  if (typeof window === 'undefined') {
    return 'unset';
  }

  const value = window.localStorage.getItem(DISCOVERY_CONSENT_STORAGE_KEY);
  if (value === 'granted' || value === 'denied') {
    return value;
  }
  return 'unset';
}

export function writeDiscoveryConsent(state: Exclude<DiscoveryConsentState, 'unset'>): void {
  if (typeof window === 'undefined') {
    return;
  }
  window.localStorage.setItem(DISCOVERY_CONSENT_STORAGE_KEY, state);
}

/** Slice 1: analytics disabled unless explicitly enabled and consented. */
export function isDiscoveryAnalyticsEnabledByConfig(): boolean {
  return process.env.NEXT_PUBLIC_DISCOVERY_ANALYTICS_ENABLED === 'true';
}

export function canCollectDiscoveryAnalytics(consent: DiscoveryConsentState = 'unset'): boolean {
  if (!isDiscoveryAnalyticsEnabledByConfig()) {
    return false;
  }
  return consent === 'granted';
}
