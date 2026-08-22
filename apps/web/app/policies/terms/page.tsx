import { MarketingShell } from '@/components/marketing-shell';
import { MarketingBreadcrumbs } from '@/components/marketing-breadcrumbs';
import { getPublicPage } from '@/lib/content/registry';
import { noIndexMetadata } from '@/lib/metadata';
import { getBreadcrumbs } from '@/lib/public-ia';

const page = getPublicPage('/policies/terms');

export const metadata = noIndexMetadata(
  page?.title ?? 'Terms and conditions',
  '/policies/terms',
);

export default function TermsPage() {
  return (
    <MarketingShell ctaTitle="Need help before you order?" ctaBody="Reach out if you have questions about organiser or supporter terms.">
      <MarketingBreadcrumbs items={getBreadcrumbs('/policies/terms')} />
      <article className="mx-auto max-w-3xl px-6 py-16 lg:px-8">
        <h1 className="text-3xl font-bold text-tamiym-blue">Terms and conditions (interim)</h1>
        <p className="mt-6 text-sm leading-relaxed text-black">
          This interim page records that public use of Tamiym Workshop is governed by documented
          cancellation, refund, payout, and pricing policies in the product backlog. Full
          consumer-facing terms will be published in TTW-074.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-black">
          Questions:{' '}
          <a href="mailto:info@tamiym.org" className="font-semibold text-tamiym-blue underline">
            info@tamiym.org
          </a>
          .
        </p>
      </article>
    </MarketingShell>
  );
}
