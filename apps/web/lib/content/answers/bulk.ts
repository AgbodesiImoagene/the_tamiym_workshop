import type { AnswerEntry } from './types';

const REVIEW_CADENCE = 'monthly';

const PRICING_EVIDENCE = {
  owner: 'Product/Marketing' as const,
  source: 'ttw-024-pricing-policy/v1-interim-2026-08-22',
  reviewedAt: '2026-08-22',
};

const OPERATIONS_EVIDENCE = {
  owner: 'Operations' as const,
  source: 'ttw-040-shipment-policy/v1-interim-2026-08-22',
  reviewedAt: '2026-08-22',
};

export const BULK_ANSWERS: readonly AnswerEntry[] = [
  {
    id: 'bulk-minimum-order',
    question: 'Is there a minimum bulk order quantity?',
    directAnswer:
      'Minimums depend on the products and prices you configure in the workshop; the app surfaces minimum price guidance before you commit.',
    details: [
      'Bulk pricing follows the enforced pricing policy (TTW-024).',
      'Final totals depend on sizes, quantities, and designs selected for the event.',
    ],
    evidence: PRICING_EVIDENCE,
    owner: 'Product/Marketing',
    publishedAt: '2026-08-22',
    updatedAt: '2026-08-22',
    reviewCadence: REVIEW_CADENCE,
    nextReviewTrigger: 'TTW-024 pricing policy or catalogue changes',
    canonicalPath: '/solutions/bulk',
    intentCluster: 'Q-BULK',
  },
  {
    id: 'bulk-timeline',
    question: 'How long does bulk production take?',
    directAnswer:
      'Production and delivery windows depend on product selection, quantities, and the schedule you agree before manufacturing starts.',
    details: [
      'Confirm timelines in your order workflow; domestic Nigeria fulfilment applies (TTW-040).',
      'Rush requests may be limited by product availability and operational capacity.',
    ],
    evidence: OPERATIONS_EVIDENCE,
    owner: 'Operations',
    publishedAt: '2026-08-22',
    updatedAt: '2026-08-22',
    reviewCadence: REVIEW_CADENCE,
    nextReviewTrigger: 'TTW-040 shipment SLA or capacity updates',
    canonicalPath: '/solutions/bulk',
    intentCluster: 'Q-BULK',
  },
  {
    id: 'bulk-design-process',
    question: 'Can we preview designs before ordering?',
    directAnswer:
      'Yes — use the workshop to create mock-ups and align stakeholders before you lock sizes and quantities.',
    details: [
      'Design assets remain subject to moderation and product compatibility checks.',
      'Share previews internally; production starts after you confirm the order in the organiser app.',
    ],
    evidence: PRICING_EVIDENCE,
    owner: 'Product/Marketing',
    publishedAt: '2026-08-22',
    updatedAt: '2026-08-22',
    reviewCadence: REVIEW_CADENCE,
    nextReviewTrigger: 'Workshop or moderation policy changes',
    canonicalPath: '/solutions/bulk',
    intentCluster: 'Q-DESIGN',
  },
];
