/** Governed public page and editorial content types (TTW-072). */

export type PageType = 'hub' | 'service' | 'landing' | 'policy' | 'dynamic';

export type PageLifecycle = 'published' | 'draft' | 'archived';

export type ContentOwner = 'Product/Marketing' | 'Fundraising PM' | 'Engineering';

export interface EvidenceRecord {
  owner: ContentOwner;
  source: string;
  reviewedAt: string;
}

export interface EditorialStat {
  value: string;
  label: string;
  evidence: EvidenceRecord;
}

export interface EditorialSectionContent {
  title: string;
  body: string[];
  bullets?: string[];
  imageUrl: string;
  imageAlt: string;
  reverse?: boolean;
  evidence?: EvidenceRecord;
}

export interface PublicPageDefinition {
  path: string;
  pageType: PageType;
  intentClusters: readonly string[];
  title: string;
  description: string;
  lifecycle: PageLifecycle;
  indexable: boolean;
  owner: ContentOwner;
  publishedAt: string;
  updatedAt: string;
  reviewCadence: string;
  /** Parent crumbs only; current page is appended by `getBreadcrumbs`. */
  parentPath?: string;
  relatedPaths?: readonly string[];
}

export interface BreadcrumbItem {
  label: string;
  href: string;
}
