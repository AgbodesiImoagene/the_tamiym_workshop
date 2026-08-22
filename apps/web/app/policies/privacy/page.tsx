import { MarketingShell } from '@/components/marketing-shell';
import { getPublicPage } from '@/lib/content/registry';
import { noIndexMetadata } from '@/lib/metadata';

const page = getPublicPage('/policies/privacy');

export const metadata = noIndexMetadata(page?.title ?? 'Privacy policy', '/policies/privacy');

export default function PrivacyPolicyPage() {
  return (
    <MarketingShell
      pagePath="/policies/privacy"
      ctaTitle="Questions about your data?"
      ctaBody="Contact our team for interim privacy requests."
    >
      <article className="mx-auto max-w-3xl px-6 py-16 lg:px-8">
        <h1 className="text-3xl font-bold text-tamiym-blue">Privacy policy (interim)</h1>
        <p className="mt-6 text-sm leading-relaxed text-black">
          This page is a governed placeholder while the full privacy policy is prepared under
          TTW-025 and TTW-074. Tamiym Workshop processes account, order, and campaign data only for
          documented product purposes within Nigeria-first fulfilment boundaries.
        </p>
        <p className="mt-4 text-sm leading-relaxed text-black">
          For interim data requests, contact{' '}
          <a href="mailto:info@tamiym.org" className="font-semibold text-tamiym-blue underline">
            info@tamiym.org
          </a>
          .
        </p>
      </article>
    </MarketingShell>
  );
}
