/** Discovery measurement types (TTW-077). */

export type ReferrerClass =
  | 'organic_search'
  | 'generative_referral'
  | 'social_referral'
  | 'referral'
  | 'direct'
  | 'unknown';

export type DiscoveryEventName =
  | 'discovery_page_view'
  | 'discovery_qualified_intent'
  | 'discovery_answer_engagement';

export interface DiscoveryMetricDefinition {
  id: string;
  name: string;
  definition: string;
  source: string;
  baselineStatus: 'not_instrumented' | 'interim' | 'active';
  attributionLimits: string;
  dashboardOwner: string;
}

export interface DiscoveryEvent {
  name: DiscoveryEventName;
  version: string;
  occurredAt: string;
  path: string;
  referrerClass: ReferrerClass;
  /** Referrer hostname only — never full URL or query strings. */
  referrerHost?: string;
  queryCluster?: string;
  deviceClass: 'mobile' | 'desktop' | 'unknown';
  consentGranted: true;
}
