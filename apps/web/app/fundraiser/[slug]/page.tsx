import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { MarketingShell } from '@/components/marketing-shell';
import { PublicFundraiserDetail } from '@/components/public-fundraiser-detail';
import { getPublicFundraiser } from '@/lib/fundraisers';
import { buildFundraiserMetadata } from '@/lib/metadata';

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

  return (
    <MarketingShell ctaTitle="Ready To Create Some Custom Apparel ?" ctaBody="">
      <PublicFundraiserDetail fundraiser={fundraiser} />
    </MarketingShell>
  );
}
