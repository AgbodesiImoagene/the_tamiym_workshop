import Image from 'next/image';
import { MarketingShell } from '@/components/marketing-shell';
import { MarketingSplitSection } from '@/components/marketing-sections';
import { marketingAssets } from '@/lib/assets';
import { customerAppPath } from '@/lib/site';

export default function Home() {
  return (
    <MarketingShell>
      <section className="relative overflow-hidden">
        <div className="relative h-[454px]">
          <Image
            src={marketingAssets.homeHero}
            alt="People in the ocean representing a bold campaign launch"
            fill
            className="object-cover"
            priority
            sizes="100vw"
          />
          <div className="absolute inset-0 bg-black/20" />
          <div className="relative z-10 mx-auto flex h-full max-w-7xl flex-col justify-center px-6 lg:px-8">
            <div className="max-w-[35rem] space-y-8 text-white">
              <div className="space-y-3">
                <h1 className="max-w-[34rem] text-[3.2rem] font-bold leading-[1.05] tracking-[-0.03em]">
                  Printing Your Vision, Perfectly!
                </h1>
                <p className="max-w-[32rem] text-sm leading-[1.5]">
                  Streamline your bulk apparel orders with custom designs, high-quality printing,
                  and seamless management - all in one place.
                </p>
              </div>
              <a
                href={customerAppPath('/auth/register')}
                className="inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-bold text-tamiym-blue"
              >
                Get Started
              </a>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl space-y-24 overflow-hidden px-6 py-16 lg:px-8">
        <MarketingSplitSection
          id="catalog"
          title="Explore Our Product Catalog"
          description="A curated selection of high-quality bulk apparel, designed for group orders."
          imageUrl={marketingAssets.homeCatalog}
          imageAlt="White t-shirt product preview"
          ctaLabel="Explore Categories"
          ctaHref={customerAppPath('/auth/register')}
        />

        <MarketingSplitSection
          id="workshop"
          title="Create Stunning Mock-ups, instantly!"
          description="Effortlessly bring your designs to life all in just a few clicks."
          imageUrl={marketingAssets.homeMockup}
          imageAlt="Design mockup workflow on a tablet"
          ctaLabel="Create Now"
          ctaHref={customerAppPath('/auth/register')}
          reverse
        />

        <MarketingSplitSection
          title="Bulk Orders Made Easy"
          description="Manage and customize orders effortlessly from your dashboard."
          imageUrl={marketingAssets.homeOrders}
          imageAlt="Rows of apparel showing order volume"
          ctaLabel="View Workshop"
          ctaHref={customerAppPath('/auth/register')}
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
      </section>
    </MarketingShell>
  );
}
