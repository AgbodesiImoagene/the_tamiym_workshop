import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MarketingShell } from '@/components/marketing-shell';
import { PublicFundraiserDetail } from '@/components/public-fundraiser-detail';
import { JsonLd } from '@/components/json-ld';
import { getPublicFundraiser } from '@/lib/fundraisers';
import { buildFundraiserMetadata, truncateDescription } from '@/lib/metadata';
import { buildBreadcrumbListJsonLd, buildWebPageJsonLd } from '@/lib/structured-data/builders';

interface FundraiserDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
}

export async function generateMetadata({ params }: FundraiserDetailPageProps): Promise<Metadata> {
  const { slug } = await params;
  const fundraiser = await getPublicFundraiser(slug);

  if (!fundraiser) {
    return {
      title: 'Fundraiser not found',
      robots: { index: false, follow: false },
    };
  }

  return buildFundraiserMetadata({
    title: fundraiser.title,
    description: fundraiser.description,
    story: fundraiser.story,
    slug: fundraiser.slug,
  });
}

export default async function FundraiserDetailPage({ params }: FundraiserDetailPageProps) {
  const { slug } = await params;
  const fundraiser = await getPublicFundraiser(slug);

  if (!fundraiser) {
    notFound();
  }

  const description = truncateDescription(
    fundraiser.description?.trim() ||
      fundraiser.story?.trim() ||
      `Support ${fundraiser.title} with custom merchandise on Tamiym Workshop.`
  );
  const path = `/fundraiser/${fundraiser.slug}`;
  const structuredData = [
    buildWebPageJsonLd({
      name: fundraiser.title,
      description,
      path,
    }),
    buildBreadcrumbListJsonLd([
      { label: 'Home', href: '/' },
      { label: 'Fundraisers', href: '/fundraiser' },
      { label: fundraiser.title, href: path },
    ]),
  ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return (
    <MarketingShell ctaTitle="Ready To Create Some Custom Apparel ?" ctaBody="">
      <JsonLd data={structuredData} />
      <PublicFundraiserDetail fundraiser={fundraiser} />
    </MarketingShell>
  );
}
