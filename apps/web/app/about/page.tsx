import { MarketingShell } from '@/components/marketing-shell';
import { MarketingHero } from '@/components/marketing-hero';
import { MarketingBreadcrumbs } from '@/components/marketing-breadcrumbs';
import { EditorialSection, StatsStrip } from '@/components/marketing-sections';
import { aboutEditorialSections, aboutStats } from '@/lib/content/registry';
import { marketingAssets } from '@/lib/assets';
import { buildPageMetadata } from '@/lib/metadata';
import { getBreadcrumbs } from '@/lib/public-ia';

export const metadata = buildPageMetadata({
  title: 'About Tamiym Workshop',
  description:
    'Learn how Tamiym Workshop helps Nigerian event organisers, teams, and communities create quality custom merchandise and fundraising campaigns.',
  path: '/about',
});

export default function AboutPage() {
  return (
    <MarketingShell>
      <MarketingBreadcrumbs items={getBreadcrumbs('/about')} />
      <MarketingHero
        imageSrc={marketingAssets.aboutHero}
        imageAlt="Bulk apparel billboard showcasing product categories"
        priority
        overlayClassName="bg-black/30"
      >
        <div className="max-w-[40rem] space-y-5 text-white">
          <h1 className="text-[2.75rem] font-bold leading-[1.08] tracking-[-0.03em] sm:text-[3.25rem]">
            Elevating Events, Effortlessly
          </h1>
          <p className="max-w-2xl text-sm font-semibold leading-relaxed text-white/95 sm:text-base">
            Quality bulk printing and custom merch for organizers who want memorable events without
            the logistics headache.
          </p>
        </div>
      </MarketingHero>

      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="max-w-6xl space-y-4 text-lg leading-[1.45] text-black">
          <p>
            We envision a world where event organizers and communities can focus on creating
            unforgettable experiences without being held back by logistical or creative limitations.
            By providing high-quality, affordable bulk-printing solutions, we eliminate the barriers
            to personalized event branding.
          </p>
          <p>
            Our mission is to empower individuals, organizations, and businesses to bring their
            events to life with ease, fostering creativity and connection while enabling them to
            celebrate their passions and milestones in style.
          </p>
        </div>
      </section>

      <StatsStrip
        items={aboutStats.map((stat) => ({
          value: stat.value,
          label: stat.label,
          evidenceOwner: stat.evidence.owner,
        }))}
      />

      <section className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        {aboutEditorialSections.map((section) => (
          <EditorialSection
            key={section.title}
            title={section.title}
            imageUrl={section.imageUrl}
            imageAlt={section.imageAlt}
            body={section.body}
            bullets={section.bullets}
            reverse={section.reverse}
          />
        ))}
      </section>
    </MarketingShell>
  );
}
