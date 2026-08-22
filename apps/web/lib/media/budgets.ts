import type { PerformanceBudget } from './types';

/** Representative public templates measured in slice 1 lab baselines. */
export const REPRESENTATIVE_PUBLIC_ROUTES = [
  '/',
  '/about',
  '/fundraiser',
  '/fundraiser/[slug]',
  '/guides/how-fundraising-works',
  '/solutions/bulk',
  '/404',
] as const;

/** Interim mobile-first lab targets — CI enforcement deferred to TTW-078. */
export const INTERIM_MOBILE_BUDGETS: readonly PerformanceBudget[] = [
  { metric: 'LCP', targetP75: 2500, unit: 'ms' },
  { metric: 'CLS', targetP75: 0.1, unit: 'score' },
  { metric: 'INP', targetP75: 200, unit: 'ms' },
] as const;
