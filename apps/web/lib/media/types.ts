/** Public media and performance contracts (TTW-076). */

export type MediaRole = 'hero' | 'og-default' | 'content' | 'logo' | 'icon';

export interface MediaAsset {
  id: string;
  path: string;
  alt: string;
  role: MediaRole;
  /** Documented byte budget for slice 1 baselines; enforcement deferred to slice 2. */
  maxBytes?: number;
  width?: number;
  height?: number;
}

export interface PerformanceBudget {
  metric: 'LCP' | 'CLS' | 'INP';
  /** Mobile lab target (p75) documented in interim policy. */
  targetP75: number;
  unit: 'ms' | 'score';
}
