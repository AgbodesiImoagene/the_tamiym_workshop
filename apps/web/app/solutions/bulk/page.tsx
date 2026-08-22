import Link from 'next/link';
import { MarketingShell } from '@/components/marketing-shell';
import { MarketingHero } from '@/components/marketing-hero';
import { MarketingSplitSection } from '@/components/marketing-sections';
import { getPublicPage } from '@/lib/content/registry';
import { marketingAssets } from '@/lib/assets';
import { buildPageMetadata } from '@/lib/metadata';
import { webRegisterWithNext } from '@/lib/site';

const page = getPublicPage('/solutions/bulk');

export const metadata = buildPageMetadata({
  title: page?.title ?? 'Bulk custom apparel for events and teams',
  description:
    page?.description ??
    'Order quality bulk custom apparel in Nigeria with design tools and reliable fulfilment.',
  path: '/solutions/bulk',
});

export default function BulkSolutionsPage() {
  return (
    <MarketingShell
      pagePath="/solutions/bulk"
      ctaTitle="Start your bulk order"
      ctaBody="Create an account to design, price, and manage event merchandise in one workshop."
      ctaHref={webRegisterWithNext('/solutions/bulk')}
    >
      <MarketingHero
        imageSrc={marketingAssets.homeOrders}
        imageAlt="Rows of custom event apparel prepared for bulk fulfilment"
        priority
        overlayClassName="bg-black/25"
      >
        <div className="max-w-[40rem] space-y-5 text-white">
          <h1 className="text-[2.75rem] font-bold leading-[1.08] tracking-[-0.03em] sm:text-[3.25rem]">
            Bulk custom apparel for Nigerian events and teams
          </h1>
          <p className="max-w-2xl text-sm font-semibold leading-relaxed text-white/95 sm:text-base">
            One destination for group orders, design mock-ups, and fulfilment — without competing
            fundraising journeys on the same page.
          </p>
        </div>
      </MarketingHero>

      <section className="mx-auto max-w-7xl space-y-24 px-6 py-16 lg:px-8">
        <MarketingSplitSection
          title="Built for organisers ordering at scale"
          description="Schools, teams, churches, and corporate events use Tamiym to coordinate sizes, designs, and delivery windows."
          imageUrl={marketingAssets.homeCatalog}
          imageAlt="Curated bulk apparel catalog preview"
          ctaLabel="Explore the workshop"
          ctaHref={webRegisterWithNext('/solutions/bulk')}
        />

        <MarketingSplitSection
          title="Design before you commit"
          description="Use the workshop to preview mock-ups, align stakeholders, and lock pricing before production starts."
          imageUrl={marketingAssets.homeMockup}
          imageAlt="Design mock-up workflow on a tablet"
          ctaLabel="Create a mock-up"
          ctaHref={webRegisterWithNext('/solutions/bulk')}
          reverse
        />
      </section>

      <section className="mx-auto max-w-7xl border-t border-black/10 px-6 py-12 lg:px-8">
        <h2 className="text-xl font-bold text-tamiym-blue">Related journeys</h2>
        <ul className="mt-4 space-y-2 text-sm">
          <li>
            <Link href="/#workshop" className="font-semibold text-tamiym-blue hover:underline">
              Design workshop on the home page
            </Link>
          </li>
          <li>
            <Link href="/fundraiser" className="font-semibold text-tamiym-blue hover:underline">
              Fundraise with custom merchandise
            </Link>
          </li>
        </ul>
      </section>
    </MarketingShell>
  );
}
