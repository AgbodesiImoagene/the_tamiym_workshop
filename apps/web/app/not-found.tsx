import Link from 'next/link';
import { MarketingShell } from '@/components/marketing-shell';
import { customerAppPath } from '@/lib/site';

export default function NotFound() {
  return (
    <MarketingShell ctaTitle="Still ready to launch something custom?" ctaLabel="Open Workshop">
      <section className="mx-auto max-w-4xl px-6 py-24 text-center lg:px-8">
        <div className="space-y-6 rounded-[2rem] border border-black/10 bg-white px-8 py-16 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-primary">Not Found</p>
          <h1 className="text-4xl font-bold tracking-[-0.03em] text-tamiym-blue">
            This fundraiser link is no longer available.
          </h1>
          <p className="mx-auto max-w-2xl text-base leading-[1.6] text-black/75">
            The campaign may be inactive, moved, or not published yet. You can still start your
            own fundraiser or create an account to continue in the workshop.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <Link
              href="/fundraiser"
              className="inline-flex rounded-lg border border-tamiym-blue px-5 py-3 text-sm font-bold text-tamiym-blue"
            >
              Back to Fundraiser
            </Link>
            <Link
              href={customerAppPath('/auth/register')}
              className="inline-flex rounded-lg bg-accent px-5 py-3 text-sm font-bold text-tamiym-blue"
            >
              Create An Account
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
