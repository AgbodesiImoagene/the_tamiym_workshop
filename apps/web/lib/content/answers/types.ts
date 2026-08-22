import type { ContentOwner, EvidenceRecord } from '@/lib/content/types';

export interface AnswerEntry {
  id: string;
  question: string;
  /** Lead sentence that must stand alone when quoted. */
  directAnswer: string;
  /** Qualifying conditions, examples, or next steps shown below the direct answer. */
  details?: string[];
  evidence: EvidenceRecord;
  owner: ContentOwner;
  publishedAt: string;
  updatedAt: string;
  reviewCadence: string;
  nextReviewTrigger: string;
  /** Canonical page path that owns this answer. */
  canonicalPath: string;
  intentCluster: string;
}
