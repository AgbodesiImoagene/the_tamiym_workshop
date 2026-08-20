import { MarketingShell } from '@/components/marketing-shell';
import { MarketingHero } from '@/components/marketing-hero';
import { marketingAssets } from '@/lib/assets';
import { webRegisterWithNext } from '@/lib/site';
import Image from 'next/image';

export default function FundraiserPage() {
  return (
    <MarketingShell>
      <MarketingHero
        imageSrc={marketingAssets.fundraiserHero}
        imageAlt="People enjoying the water during a fundraiser campaign visual"
        priority
        overlayClassName="bg-black/25"
      >
        <div className="max-w-[36rem] space-y-8 text-white">
          <div className="space-y-3">
            <h1 className="text-[3.2rem] font-bold leading-[1.05] tracking-[-0.03em]">
              Raise funds with custom merch!
            </h1>
            <p className="text-sm font-bold">Turn your cause into a movement</p>
          </div>
          <a
            href={webRegisterWithNext('/fundraiser')}
            className="inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-bold text-tamiym-blue"
          >
            Start A Fundraiser
          </a>
        </div>
      </MarketingHero>

      <section className="mx-auto max-w-7xl px-6 py-16 text-center lg:px-8">
        <div className="space-y-4 text-tamiym-blue">
          <h2 className="text-4xl font-bold tracking-[-0.03em]">
            Sell Custom Apparel, Collect Donations, Effortlessly
          </h2>
          <p className="text-sm font-bold text-black">
            The Tamiym Workshop Fundraising makes supporting your cause simple and risk-free
          </p>
        </div>

        <div className="mx-auto mt-16 max-w-6xl space-y-10">
          <div className="relative h-[280px] overflow-hidden rounded-2xl sm:h-[417px]">
            <Image
              src={marketingAssets.fundraiserContent}
              alt="Laptop showing custom apparel design for campaign selling"
              fill
              className="object-cover"
              sizes="100vw"
            />
          </div>

          <div className="space-y-6 text-center">
            <h3 className="text-[3rem] font-bold leading-[1.15] tracking-[-0.03em] text-tamiym-blue">
              Raise Funds Effortlessly with Custom Apparel
            </h3>
            <p className="mx-auto max-w-5xl text-lg leading-[1.45] text-tamiym-blue">
              Create and sell custom apparel while collecting donations with no upfront costs, no
              inventory, no stress. Simply design your merch, share your story, and launch your
              campaign. We handle production and fulfillment, so you can focus on making an impact.
              Perfect for organizations, events, and communities looking to fundraise in a seamless
              and risk-free way.
            </p>
            <a
              href={webRegisterWithNext('/fundraiser')}
              className="inline-flex rounded-lg bg-accent px-5 py-3 text-sm font-bold text-tamiym-blue"
            >
              Get Started
            </a>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
