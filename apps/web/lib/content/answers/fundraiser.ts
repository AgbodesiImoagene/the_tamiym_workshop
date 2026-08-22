import type { AnswerEntry } from './types';

const REVIEW_CADENCE = 'monthly';

const FUNDRAISING_EVIDENCE = {
  owner: 'Fundraising PM' as const,
  source: 'ttw-031-034-042-interim-policies/v1-2026-08-22',
  reviewedAt: '2026-08-22',
};

const OPERATIONS_EVIDENCE = {
  owner: 'Operations' as const,
  source: 'ttw-040-shipment-policy/v1-interim-2026-08-22',
  reviewedAt: '2026-08-22',
};

const PRICING_EVIDENCE = {
  owner: 'Product/Marketing' as const,
  source: 'ttw-024-pricing-policy/v1-interim-2026-08-22',
  reviewedAt: '2026-08-22',
};

export const FUNDRAISER_ANSWERS: readonly AnswerEntry[] = [
  {
    id: 'fund-upfront-cost',
    question: 'Do organisers pay upfront before launching a fundraiser?',
    directAnswer:
      'You can configure a campaign and publish it after readiness and moderation checks without pre-purchasing inventory.',
    details: [
      'Supporters pay at checkout when they order campaign merchandise.',
      'Payout eligibility depends on campaign approval, KYC, and documented payout policy requirements.',
    ],
    evidence: FUNDRAISING_EVIDENCE,
    owner: 'Fundraising PM',
    publishedAt: '2026-08-22',
    updatedAt: '2026-08-22',
    reviewCadence: REVIEW_CADENCE,
    nextReviewTrigger: 'Changes to TTW-042 payout or TTW-034 activation policy',
    canonicalPath: '/fundraiser',
    intentCluster: 'Q-FUND-HOW',
  },
  {
    id: 'fund-supporter-checkout',
    question: 'How do supporters pay for campaign merchandise?',
    directAnswer:
      'Supporters checkout on your public campaign page in NGN using Paystack; paid orders appear in organiser tooling after confirmation.',
    details: [
      'Checkout preserves supporter selections through the documented web flow (TTW-032).',
      'Campaign offers and pricing come from approved public API data (TTW-031).',
    ],
    evidence: FUNDRAISING_EVIDENCE,
    owner: 'Fundraising PM',
    publishedAt: '2026-08-22',
    updatedAt: '2026-08-22',
    reviewCadence: REVIEW_CADENCE,
    nextReviewTrigger: 'Checkout or offer contract changes',
    canonicalPath: '/fundraiser',
    intentCluster: 'Q-FUND-HOW',
  },
  {
    id: 'fund-fulfilment',
    question: 'Who handles production and delivery?',
    directAnswer:
      'Tamiym coordinates production and domestic Nigeria fulfilment according to the shipment lifecycle policy.',
    details: [
      'Delivery timing depends on product mix, order volume, and the schedule you set for the campaign.',
      'Track shipment status through the documented order and fulfilment flows (TTW-040).',
    ],
    evidence: OPERATIONS_EVIDENCE,
    owner: 'Operations',
    publishedAt: '2026-08-22',
    updatedAt: '2026-08-22',
    reviewCadence: REVIEW_CADENCE,
    nextReviewTrigger: 'TTW-040 shipment policy updates',
    canonicalPath: '/fundraiser',
    intentCluster: 'Q-FUND-HOW',
  },
  {
    id: 'fund-fees',
    question: 'What fees or pricing rules apply?',
    directAnswer:
      'Checkout totals follow enforced pricing, VAT, and minimum price rules; organiser payout treatment is governed by payout policy.',
    details: [
      'Supporters see the price they will pay before completing Paystack checkout.',
      'Organiser-facing payout eligibility is separate from supporter checkout totals (TTW-042).',
    ],
    evidence: PRICING_EVIDENCE,
    owner: 'Product/Marketing',
    publishedAt: '2026-08-22',
    updatedAt: '2026-08-22',
    reviewCadence: REVIEW_CADENCE,
    nextReviewTrigger: 'TTW-024 pricing or TTW-042 payout policy changes',
    canonicalPath: '/fundraiser',
    intentCluster: 'Q-FUND',
  },
];
