import Image from 'next/image';
import Link from 'next/link';
import { Card, CardContent, cn } from '@tamiym/ui';

interface MarketingSplitSectionProps {
  id?: string;
  title: string;
  description: string;
  imageUrl: string;
  imageAlt: string;
  ctaLabel?: string;
  ctaHref?: string;
  reverse?: boolean;
}

export function MarketingSplitSection({
  id,
  title,
  description,
  imageUrl,
  imageAlt,
  ctaLabel,
  ctaHref,
  reverse = false,
}: MarketingSplitSectionProps) {
  return (
    <section
      id={id}
      className={cn(
        'grid items-center gap-10 lg:grid-cols-[minmax(0,360px)_minmax(0,503px)] lg:gap-14',
        reverse && 'lg:grid-cols-[minmax(0,503px)_minmax(0,360px)]'
      )}
    >
      <div className={cn('space-y-4', reverse && 'lg:order-2')}>
        <h2 className="max-w-[22rem] text-[1.5625rem] font-bold leading-[1.2] text-tamiym-blue">
          {title}
        </h2>
        <p className="max-w-[17rem] text-sm leading-[1.5] text-black">{description}</p>
        {ctaLabel && ctaHref ? (
          <Link
            href={ctaHref}
            className="inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-bold text-tamiym-blue"
          >
            {ctaLabel}
          </Link>
        ) : null}
      </div>

      <div
        className={cn(
          'relative mx-auto h-[360px] w-full max-w-[503px] overflow-hidden border border-black/20 bg-white shadow-sm sm:h-[520px] lg:h-[750px]',
          reverse ? 'rounded-l-[8rem] rounded-r-2xl' : 'rounded-r-[8rem] rounded-l-2xl'
        )}
      >
        <Image
          src={imageUrl}
          alt={imageAlt}
          fill
          className="object-cover"
          sizes="(min-width: 1024px) 503px, 100vw"
        />
      </div>
    </section>
  );
}

interface EditorialSectionProps {
  title: string;
  body: string[];
  bullets?: string[];
  imageUrl: string;
  imageAlt: string;
  reverse?: boolean;
}

export function EditorialSection({
  title,
  body,
  bullets,
  imageUrl,
  imageAlt,
  reverse = false,
}: EditorialSectionProps) {
  return (
    <section
      className={cn(
        'grid items-start gap-8 border-t border-black/10 py-10 lg:grid-cols-[minmax(0,528px)_minmax(0,1fr)] lg:gap-10',
        reverse && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,528px)]'
      )}
    >
      <div className={cn(reverse && 'lg:order-2')}>
        <div className="relative h-[260px] overflow-hidden rounded-2xl sm:h-[305px]">
          <Image
            src={imageUrl}
            alt={imageAlt}
            fill
            className="object-cover"
            sizes="(min-width: 1024px) 528px, 100vw"
          />
        </div>
      </div>

      <div className="space-y-5 text-tamiym-blue">
        <h2 className="text-[2rem] font-bold leading-[1.2] tracking-[-0.03em]">{title}</h2>
        <div className="space-y-4 text-sm leading-[1.5] text-black">
          {body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
          {bullets?.length ? (
            <ul className="list-disc space-y-1 pl-5">
              {bullets.map((bullet) => (
                <li key={bullet}>{bullet}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}

interface StatsStripProps {
  items: Array<{
    value: string;
    label: string;
    evidenceOwner?: string;
  }>;
}

export function StatsStrip({ items }: StatsStripProps) {
  return (
    <section className="bg-tamiym-blue py-10 text-white">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <p className="text-center text-xl font-bold">Take a look at these numbers</p>
        <div className="mt-8 grid gap-8 text-center md:grid-cols-3">
          {items.map((item) => (
            <div
              key={item.label}
              className="space-y-3"
              {...(item.evidenceOwner ? { 'data-evidence-owner': item.evidenceOwner } : undefined)}
            >
              <p className="font-heading text-5xl uppercase tracking-headline">{item.value}</p>
              <p className="text-sm font-bold">{item.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

interface CalloutCardProps {
  title: string;
  body: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function CalloutCard({ title, body, ctaLabel, ctaHref }: CalloutCardProps) {
  return (
    <Card className="overflow-hidden rounded-[2rem] border border-black/10 bg-primary text-white shadow-none">
      <CardContent className="relative overflow-hidden p-8">
        <div className="absolute -left-8 -top-16 h-40 w-40 rounded-full border-4 border-white/90" />
        <div className="absolute -left-4 -top-12 h-28 w-28 rounded-full border-4 border-white/90" />
        <div className="absolute -bottom-12 right-0 h-44 w-44 rounded-full border-4 border-white/90" />
        <div className="absolute -bottom-6 right-6 h-32 w-32 rounded-full border-4 border-white/90" />
        <div className="relative z-10 mx-auto flex max-w-2xl flex-col items-center gap-5 text-center">
          <h2 className="text-[2rem] font-bold leading-[1.2]">{title}</h2>
          <p className="max-w-xl text-sm leading-[1.5] text-white/90">{body}</p>
          {ctaLabel && ctaHref ? (
            <Link
              href={ctaHref}
              className="inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-bold text-tamiym-blue"
            >
              {ctaLabel}
            </Link>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}
