/** Crawler governance types (TTW-075). */

export type CrawlerCategory = 'conventional_search' | 'ai_search' | 'ai_training' | 'default';

export interface CrawlerAgentDefinition {
  userAgent: string;
  category: CrawlerCategory;
  /** Primary vendor documentation URL reviewed for this policy. */
  sourceUrl: string;
  sourceReviewedAt: string;
}

export interface CrawlerPolicyDecision {
  category: CrawlerCategory;
  /** Whether the agent may fetch public marketing HTML for search/answers. */
  allowPublicDiscovery: boolean;
  /** Whether the agent may use content for model training (default false). */
  allowTraining: boolean;
  owner: 'Engineering' | 'Product/Marketing' | 'Legal';
  notes: string;
}
