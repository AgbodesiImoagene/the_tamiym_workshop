import Link from 'next/link';

interface MarketingCtaCardProps {
  title: string;
  body?: string;
  ctaLabel: string;
  ctaHref: string;
}

/**
 * Pre-footer CTA — background and rings are CSS only (no bitmap), for predictable layout and overlap.
 */
export function MarketingCtaCard({ title, body, ctaLabel, ctaHref }: MarketingCtaCardProps) {
  return (
    <section
      aria-label="Call to action"
      className="relative isolate overflow-hidden rounded-[2rem] bg-primary px-6 py-12 text-center text-white shadow-[0_16px_48px_rgba(0,35,80,0.18)] sm:px-10 sm:py-14"
    >
      {/* Code-drawn ring clusters (Figma-style), clipped by rounded card */}
      <div
        className="pointer-events-none absolute -left-8 -top-16 h-44 w-44 rounded-full border-[3px] border-white/85 sm:-left-6 sm:-top-12 sm:h-52 sm:w-52"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-2 -top-8 h-28 w-28 rounded-full border-[3px] border-white/75 sm:h-36 sm:w-36"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -left-6 top-4 h-16 w-16 rounded-full border-2 border-white/55"
        aria-hidden
      />

      <div
        className="pointer-events-none absolute -right-4 -bottom-20 h-52 w-52 rounded-full border-[3px] border-white/85 sm:-bottom-24 sm:h-60 sm:w-60"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute right-2 -bottom-12 h-36 w-36 rounded-full border-[3px] border-white/75 sm:right-4 sm:h-44 sm:w-44"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-2 bottom-6 h-20 w-20 rounded-full border-2 border-white/55"
        aria-hidden
      />

      <div className="relative z-10 mx-auto max-w-xl space-y-5">
        <h2 className="text-[1.65rem] font-bold leading-[1.2] sm:text-[2rem]">{title}</h2>
        {body ? <p className="text-sm leading-relaxed text-white/90 sm:text-base">{body}</p> : null}
        <Link
          href={ctaHref}
          className="inline-flex rounded-lg bg-accent px-5 py-2.5 text-sm font-bold text-tamiym-blue shadow-sm"
        >
          {ctaLabel}
        </Link>
      </div>
    </section>
  );
}
