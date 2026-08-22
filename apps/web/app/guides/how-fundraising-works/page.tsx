import Link from 'next/link';
import { MarketingShell } from '@/components/marketing-shell';
import { PageAnswers } from '@/components/page-answers';
import { getPublicPage } from '@/lib/content/registry';
import { buildPageMetadata } from '@/lib/metadata';
import { webRegisterWithNext } from '@/lib/site';

const page = getPublicPage('/guides/how-fundraising-works');

export const metadata = buildPageMetadata({
  title: page?.title ?? 'How fundraising with custom merchandise works',
  description:
    page?.description ??
    'Answers about launching a merchandise fundraiser, supporter checkout, and fulfilment on Tamiym Workshop.',
  path: '/guides/how-fundraising-works',
});

export default function HowFundraisingWorksPage() {
  return (
    <MarketingShell
      pagePath="/guides/how-fundraising-works"
      ctaTitle="Ready to launch your campaign?"
      ctaBody="Create an organiser account to design merchandise and publish your fundraiser."
      ctaHref={webRegisterWithNext('/guides/how-fundraising-works')}
    >
      <article className="mx-auto max-w-3xl px-6 py-16 lg:px-8">
        <h1 className="text-3xl font-bold text-tamiym-blue">
          How fundraising with custom merchandise works
        </h1>
        <p className="mt-6 text-sm leading-relaxed text-black">
          This guide answers the most common organiser questions about launching a Nigeria-first
          merchandise fundraiser on Tamiym Workshop. Each answer is owned by the relevant business
          policy team and reviewed against interim product policies.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-black">
          Ready to start?{' '}
          <Link href="/fundraiser" className="font-semibold text-tamiym-blue underline">
            Visit the fundraising landing page
          </Link>{' '}
          or{' '}
          <a
            href={webRegisterWithNext('/guides/how-fundraising-works')}
            className="font-semibold text-tamiym-blue underline"
          >
            create an organiser account
          </a>
          .
        </p>
      </article>
      <PageAnswers path="/fundraiser" title="Fundraising questions and answers" />
    </MarketingShell>
  );
}
