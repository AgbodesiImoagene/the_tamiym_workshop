import { MarketingShell } from '@/components/marketing-shell';
import { MarketingHero } from '@/components/marketing-hero';
import { MarketingPageSideDecor } from '@/components/marketing-page-decor';
import { MarketingSplitSection } from '@/components/marketing-sections';
import { marketingAssets } from '@/lib/assets';
import { webRegisterWithNext } from '@/lib/site';

export default function Home() {
  return (
    <MarketingShell>
      <MarketingHero
        imageSrc={marketingAssets.homeHero}
        imageAlt="People in the ocean representing a bold campaign launch"
        priority
        overlayClassName="bg-black/20"
      >
        <div className="max-w-[35rem] space-y-8 text-white">
          <div className="space-y-3">
            <h1 className="max-w-[34rem] text-[3.2rem] font-bold leading-[1.05] tracking-[-0.03em]">
              Printing Your Vision, Perfectly!
            </h1>
            <p className="max-w-[32rem] text-sm leading-[1.5]">
              Streamline your bulk apparel orders with custom designs, high-quality printing, and
              seamless management - all in one place.
            </p>
          </div>
          <a
            href={webRegisterWithNext('/')}
            className="inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-bold text-tamiym-blue"
          >
            Get Started
          </a>
        </div>
      </MarketingHero>

      <section className="relative overflow-hidden bg-background py-16 lg:py-20">
        {/* Full-bleed decor so arcs align to viewport edges, not the content max-width */}
        <div
          className="pointer-events-none absolute inset-y-0 left-1/2 z-0 w-screen max-w-none -translate-x-1/2 overflow-hidden"
          aria-hidden
        >
          <MarketingPageSideDecor />
        </div>
        <div className="relative z-10 mx-auto max-w-7xl space-y-24 px-6 lg:px-8">
          <MarketingSplitSection
            id="catalog"
            title="Explore Our Product Catalog"
            description="A curated selection of high-quality bulk apparel, designed for group orders."
            imageUrl={marketingAssets.homeCatalog}
            imageAlt="White t-shirt product preview"
            ctaLabel="Explore Categories"
            ctaHref={webRegisterWithNext('/')}
          />

          <MarketingSplitSection
            id="workshop"
            title="Create Stunning Mock-ups, instantly!"
            description="Effortlessly bring your designs to life all in just a few clicks."
            imageUrl={marketingAssets.homeMockup}
            imageAlt="Design mockup workflow on a tablet"
            ctaLabel="Create Now"
            ctaHref={webRegisterWithNext('/')}
            reverse
          />

          <MarketingSplitSection
            title="Bulk Orders Made Easy"
            description="Manage and customize orders effortlessly from your dashboard."
            imageUrl={marketingAssets.homeOrders}
            imageAlt="Rows of apparel showing order volume"
            ctaLabel="View Workshop"
            ctaHref={webRegisterWithNext('/')}
          />

          <MarketingSplitSection
            id="design"
            title="Fund-raise with Custom Merch"
            description="Raise funds effortlessly by creating and selling custom apparel for your cause."
            imageUrl={marketingAssets.homeFundraiser}
            imageAlt="Laptop showing custom apparel setup"
            ctaLabel="Get Started"
            ctaHref="/fundraiser"
            reverse
          />
        </div>
      </section>
    </MarketingShell>
  );
}
