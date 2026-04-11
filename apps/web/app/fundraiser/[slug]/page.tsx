import { notFound } from 'next/navigation';
import { MarketingShell } from '@/components/marketing-shell';
import { PublicFundraiserDetail } from '@/components/public-fundraiser-detail';
import { getPublicFundraiser } from '@/lib/fundraisers';

interface FundraiserDetailPageProps {
  params: Promise<{
    slug: string;
  }>;
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
