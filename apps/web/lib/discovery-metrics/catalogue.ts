import type { DiscoveryMetricDefinition } from './types';

export const DISCOVERY_METRICS_CATALOGUE_VERSION = 'discovery-metrics/v1-interim-2026-08-22';
export const DISCOVERY_EVENTS_VERSION = 'discovery-events/v1-interim-2026-08-22';
export const DISCOVERY_TIMEZONE = 'Africa/Lagos';

/** Versioned metric catalogue aligned with TTW-070 baseline table. */
export const DISCOVERY_METRICS: readonly DiscoveryMetricDefinition[] = [
  {
    id: 'idx_pages',
    name: 'Indexable public URLs',
    definition: 'Count of indexable public URLs returning 200 with index allowed.',
    source: 'GSC/Bing + crawl audit',
    baselineStatus: 'not_instrumented',
    attributionLimits: 'Vendor delay; exclude staging domains.',
    dashboardOwner: 'Engineering',
  },
  {
    id: 'idx_errors',
    name: 'Index coverage errors',
    definition: 'Coverage errors or excluded critical public pages.',
    source: 'GSC/Bing',
    baselineStatus: 'not_instrumented',
    attributionLimits: 'Vendor sampling.',
    dashboardOwner: 'Engineering',
  },
  {
    id: 'seo_impressions',
    name: 'Search impressions',
    definition: 'Impressions for the verified search property.',
    source: 'Google Search Console',
    baselineStatus: 'not_instrumented',
    attributionLimits: 'Query sampling; brand bias.',
    dashboardOwner: 'Product/Marketing',
  },
  {
    id: 'seo_clicks',
    name: 'Search clicks',
    definition: 'Clicks from search results to the verified property.',
    source: 'Google Search Console',
    baselineStatus: 'not_instrumented',
    attributionLimits: 'Vendor delay.',
    dashboardOwner: 'Product/Marketing',
  },
  {
    id: 'seo_ctr',
    name: 'Search CTR',
    definition: 'seo_clicks divided by seo_impressions.',
    source: 'Derived',
    baselineStatus: 'not_instrumented',
    attributionLimits: 'Low-volume variance.',
    dashboardOwner: 'Product/Marketing',
  },
  {
    id: 'organic_sessions',
    name: 'Organic sessions',
    definition: 'Sessions with an organic search referrer on public marketing routes.',
    source: 'Web analytics (TTW-077 events)',
    baselineStatus: 'interim',
    attributionLimits: 'Consent impact; cross-device loss.',
    dashboardOwner: 'Product/Marketing',
  },
  {
    id: 'organic_register',
    name: 'Organic registrations',
    definition: 'Registrations with organic landing or referrer attribution.',
    source: 'Product analytics',
    baselineStatus: 'not_instrumented',
    attributionLimits: 'Requires UTM discipline; last-click bias.',
    dashboardOwner: 'Product/Marketing',
  },
  {
    id: 'organic_campaign_pub',
    name: 'Organic campaign publishes',
    definition: 'Campaigns first published from an organic landing journey.',
    source: 'Product DB + analytics',
    baselineStatus: 'not_instrumented',
    attributionLimits: 'Multi-touch undervalued.',
    dashboardOwner: 'Fundraising PM',
  },
  {
    id: 'organic_supporter_order',
    name: 'Organic supporter orders',
    definition: 'Paid orders from organic campaign landings.',
    source: 'Order DB + analytics',
    baselineStatus: 'not_instrumented',
    attributionLimits: 'Campaign slug may be brand-heavy long-tail.',
    dashboardOwner: 'Product/Marketing',
  },
  {
    id: 'schema_valid_rate',
    name: 'Schema validity rate',
    definition: 'Share of priority URLs passing structured-data validation.',
    source: 'CI + manual audit',
    baselineStatus: 'interim',
    attributionLimits: 'Tooling does not guarantee rich results.',
    dashboardOwner: 'Engineering',
  },
  {
    id: 'cwv_lcp_p75',
    name: 'LCP p75',
    definition: 'Largest Contentful Paint p75 on representative public routes.',
    source: 'RUM/Lab (TTW-076)',
    baselineStatus: 'interim',
    attributionLimits: 'Lab vs field divergence.',
    dashboardOwner: 'Engineering',
  },
  {
    id: 'aeo_answer_coverage',
    name: 'Answer coverage',
    definition: 'Priority questions with on-page direct answer and evidence.',
    source: 'Editorial audit',
    baselineStatus: 'interim',
    attributionLimits: 'Manual rubric.',
    dashboardOwner: 'Product/Marketing',
  },
  {
    id: 'geo_entity_consistency',
    name: 'Entity consistency',
    definition: 'Sampled generative answers match the approved entity map.',
    source: 'Manual prompt audit',
    baselineStatus: 'not_instrumented',
    attributionLimits: 'Model volatility; not market share.',
    dashboardOwner: 'Product/Marketing',
  },
] as const;

export function getDiscoveryMetric(id: string): DiscoveryMetricDefinition | undefined {
  return DISCOVERY_METRICS.find((metric) => metric.id === id);
}

export function validateDiscoveryMetricsCatalogue(): string[] {
  const errors: string[] = [];
  const ids = new Set<string>();

  for (const metric of DISCOVERY_METRICS) {
    if (ids.has(metric.id)) {
      errors.push(`Duplicate discovery metric id "${metric.id}"`);
    }
    ids.add(metric.id);

    if (!metric.definition.trim() || !metric.attributionLimits.trim()) {
      errors.push(`Discovery metric "${metric.id}" is missing definition or attribution limits`);
    }
  }

  return errors;
}
