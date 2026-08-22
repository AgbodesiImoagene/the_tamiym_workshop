import { marketingAssets } from '@/lib/assets';
import type {
  EditorialSectionContent,
  EditorialStat,
  EvidenceRecord,
  PublicPageDefinition,
} from './types';

const REVIEW_CADENCE = 'monthly';

const EVIDENCE_OPS: EvidenceRecord = {
  owner: 'Product/Marketing',
  source: 'operations-dashboard/v1-interim-2026-08-22',
  reviewedAt: '2026-08-22',
};

export const PUBLIC_PAGES: readonly PublicPageDefinition[] = [
  {
    path: '/',
    pageType: 'hub',
    intentClusters: ['Q-BRAND', 'Q-BULK', 'Q-DESIGN'],
    title: 'Bulk custom apparel and fundraising',
    description:
      'Streamline bulk apparel orders with custom designs, high-quality printing, and seamless fundraising campaigns for Nigerian teams and communities.',
    lifecycle: 'published',
    indexable: true,
    owner: 'Product/Marketing',
    publishedAt: '2026-01-01',
    updatedAt: '2026-08-22',
    reviewCadence: REVIEW_CADENCE,
    relatedPaths: ['/solutions/bulk', '/fundraiser', '/about'],
  },
  {
    path: '/about',
    pageType: 'landing',
    intentClusters: ['Q-BRAND', 'Q-TRUST'],
    title: 'About Tamiym Workshop',
    description:
      'Learn how Tamiym Workshop helps Nigerian event organisers, teams, and communities create quality custom merchandise and fundraising campaigns.',
    lifecycle: 'published',
    indexable: true,
    owner: 'Product/Marketing',
    publishedAt: '2026-01-01',
    updatedAt: '2026-08-22',
    reviewCadence: REVIEW_CADENCE,
    parentPath: '/',
    relatedPaths: ['/solutions/bulk', '/fundraiser'],
  },
  {
    path: '/fundraiser',
    pageType: 'service',
    intentClusters: ['Q-FUND', 'Q-FUND-HOW'],
    title: 'Fundraise with custom merchandise',
    description:
      'Launch a merchandise fundraiser for your Nigerian cause with managed fulfilment, organiser tools, and supporter checkout.',
    lifecycle: 'published',
    indexable: true,
    owner: 'Fundraising PM',
    publishedAt: '2026-01-01',
    updatedAt: '2026-08-22',
    reviewCadence: REVIEW_CADENCE,
    parentPath: '/',
    relatedPaths: ['/about'],
  },
  {
    path: '/solutions/bulk',
    pageType: 'service',
    intentClusters: ['Q-BULK'],
    title: 'Bulk custom apparel for events and teams',
    description:
      'Order quality bulk custom t-shirts and event merchandise in Nigeria with design tools, transparent pricing, and reliable fulfilment.',
    lifecycle: 'published',
    indexable: true,
    owner: 'Product/Marketing',
    publishedAt: '2026-08-22',
    updatedAt: '2026-08-22',
    reviewCadence: REVIEW_CADENCE,
    parentPath: '/',
    relatedPaths: ['/#workshop', '/fundraiser'],
  },
  {
    path: '/policies/privacy',
    pageType: 'policy',
    intentClusters: ['Q-TRUST'],
    title: 'Privacy policy',
    description:
      'How Tamiym Workshop collects, uses, and protects personal data for Nigerian customers and organisers.',
    lifecycle: 'draft',
    indexable: false,
    owner: 'Product/Marketing',
    publishedAt: '2026-08-22',
    updatedAt: '2026-08-22',
    reviewCadence: REVIEW_CADENCE,
    parentPath: '/',
    relatedPaths: ['/policies/terms'],
  },
  {
    path: '/policies/terms',
    pageType: 'policy',
    intentClusters: ['Q-TRUST'],
    title: 'Terms and conditions',
    description:
      'Terms governing use of Tamiym Workshop public surfaces, organiser accounts, and supporter checkout.',
    lifecycle: 'draft',
    indexable: false,
    owner: 'Product/Marketing',
    publishedAt: '2026-08-22',
    updatedAt: '2026-08-22',
    reviewCadence: REVIEW_CADENCE,
    parentPath: '/',
    relatedPaths: ['/policies/privacy'],
  },
] as const;

export const aboutStats: readonly EditorialStat[] = [
  {
    value: '6+',
    label: 'Years of experience',
    evidence: EVIDENCE_OPS,
  },
  {
    value: '100+',
    label: 'Campaigns supported',
    evidence: EVIDENCE_OPS,
  },
  {
    value: '5000+',
    label: 'Products delivered',
    evidence: EVIDENCE_OPS,
  },
];

export const aboutEditorialSections: readonly EditorialSectionContent[] = [
  {
    title: 'Quality you can trust',
    imageUrl: marketingAssets.aboutTrust,
    imageAlt: 'Team members reviewing event apparel',
    body: [
      'We take pride in delivering premium printing solutions that exceed expectations. Every product goes through rigorous quality checks to ensure your satisfaction.',
      'We guarantee:',
    ],
    bullets: [
      'Consistent print quality',
      'Precise and durable designs',
      'A dedicated team ready to resolve any concerns promptly',
    ],
    evidence: EVIDENCE_OPS,
  },
  {
    title: 'Bulk Savings, Maximum Value',
    imageUrl: marketingAssets.aboutSavings,
    imageAlt: 'Printed apparel detail close-up',
    body: [
      'We understand that every event has a budget. That is why we offer competitive pricing on bulk orders, ensuring you get the most value for your investment.',
      'With us, you can expect:',
    ],
    bullets: [
      'Affordable rates for large-scale orders',
      'Cost-effective solutions tailored to your needs',
      'A partner that helps you make every naira count',
    ],
    reverse: true,
    evidence: EVIDENCE_OPS,
  },
  {
    title: 'Tailored Solutions for Every Occasion',
    imageUrl: marketingAssets.aboutSavings,
    imageAlt: 'Premium garment detail showing quality finish',
    body: [
      'From weddings to corporate events and religious gatherings, we provide a wide selection of customizable products to suit your unique vision.',
      'With us, you will find:',
    ],
    bullets: [
      'A diverse catalog of apparel and merchandise options',
      'Custom designs for specific events and themes',
      'Flexible production to fit your event timeline',
    ],
    evidence: EVIDENCE_OPS,
  },
  {
    title: 'Reliable delivery for your timeline',
    imageUrl: marketingAssets.aboutOccasions,
    imageAlt: 'Team session showing collaborative event planning',
    body: [
      'We know your event is unlike any other. That is why we prioritize flexibility, reliability, and value every step of the way.',
      'You can count on:',
    ],
    bullets: [
      'Efficient production timelines',
      'On-time delivery for every event',
      'A committed team keeping your plans on track',
    ],
    reverse: true,
    evidence: EVIDENCE_OPS,
  },
];

const pageByPath = new Map(PUBLIC_PAGES.map((page) => [page.path, page]));

export function getPublicPage(path: string): PublicPageDefinition | undefined {
  return pageByPath.get(path);
}

export function listIndexableStaticPaths(): string[] {
  return PUBLIC_PAGES.filter((page) => page.indexable && page.lifecycle === 'published').map(
    (page) => page.path,
  );
}
