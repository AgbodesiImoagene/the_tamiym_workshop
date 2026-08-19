import Image from 'next/image';
import { MarketingShell } from '@/components/marketing-shell';
import { EditorialSection, StatsStrip } from '@/components/marketing-sections';
import { marketingAssets } from '@/lib/assets';

export default function AboutPage() {
  return (
    <MarketingShell>
      <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
        <div className="space-y-10">
          <div className="relative h-[260px] overflow-hidden rounded-2xl sm:h-[382px]">
            <Image
              src={marketingAssets.aboutHero}
              alt="Bulk apparel billboard showcasing product categories"
              fill
              className="object-cover"
              priority
              sizes="100vw"
            />
          </div>

          <div className="space-y-5 text-tamiym-blue">
            <h1 className="text-[3.25rem] font-bold leading-[1.1] tracking-[-0.03em]">
              Elevating Events,Effortlessly
            </h1>
            <div className="max-w-6xl space-y-4 text-lg leading-[1.45] text-black">
              <p>
                We envision a world where event organizers and communities can focus on creating
                unforgettable experiences without being held back by logistical or creative
                limitations. By providing high-quality, affordable bulk-printing solutions, we
                eliminate the barriers to personalized event branding.
              </p>
              <p>
                Our mission is to empower individuals, organizations, and businesses to bring their
                events to life with ease, fostering creativity and connection while enabling them to
                celebrate their passions and milestones in style.
              </p>
            </div>
          </div>
        </div>
      </section>

      <StatsStrip
        items={[
          { value: '6+', label: 'Years of experience' },
          { value: '100+', label: 'Campaigns supported' },
          { value: '5000+', label: 'Products delivered' },
        ]}
      />

      <section className="mx-auto max-w-7xl px-6 py-8 lg:px-8">
        <EditorialSection
          title="Quality you can trust"
          imageUrl={marketingAssets.aboutTrust}
          imageAlt="Team members reviewing event apparel"
          body={[
            'We take pride in delivering premium printing solutions that exceed expectations. Every product goes through rigorous quality checks to ensure your satisfaction.',
            'We guarantee:',
          ]}
          bullets={[
            'Consistent print quality',
            'Precise and durable designs',
            'A dedicated team ready to resolve any concerns promptly',
          ]}
        />

        <EditorialSection
          title="Bulk Savings, Maximum Value"
          imageUrl={marketingAssets.aboutSavings}
          imageAlt="Printed apparel detail close-up"
          body={[
            'We understand that every event has a budget. That is why we offer competitive pricing on bulk orders, ensuring you get the most value for your investment.',
            'With us, you can expect:',
          ]}
          bullets={[
            'Affordable rates for large-scale orders',
            'Cost-effective solutions tailored to your needs',
            'A partner that helps you make every naira count',
          ]}
          reverse
        />

        <EditorialSection
          title="Tailored Solutions for Every Occasion"
          imageUrl={marketingAssets.aboutSavings}
          imageAlt="Premium garment detail showing quality finish"
          body={[
            'From weddings to corporate events and religious gatherings, we provide a wide selection of customizable products to suit your unique vision.',
            'With us, you will find:',
          ]}
          bullets={[
            'A diverse catalog of apparel and merchandise options',
            'Custom designs for specific events and themes',
            'Flexible production to fit your event timeline',
          ]}
        />

        <EditorialSection
          title="Tailored Solutions for Every Occasion"
          imageUrl={marketingAssets.aboutOccasions}
          imageAlt="Team session showing collaborative event planning"
          body={[
            'We know your event is unlike any other. That is why we prioritize flexibility, reliability, and value every step of the way.',
            'You can count on:',
          ]}
          bullets={[
            'Efficient production timelines',
            'On-time delivery for every event',
            'A committed team keeping your plans on track',
          ]}
          reverse
        />
      </section>
    </MarketingShell>
  );
}
