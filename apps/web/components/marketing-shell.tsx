import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { marketingAssets } from '@/lib/assets';
import { customerAppPath } from '@/lib/site';

const footerLinks = {
  company: [
    { label: 'About', href: '/about' },
    { label: 'Fundraiser', href: '/fundraiser' },
    { label: 'Design Lab', href: customerAppPath('/auth/register') },
  ],
  information: [
    { label: 'Privacy Policy', href: '#' },
    { label: 'Terms & Conditions', href: '#' },
  ],
};

const socialLinks = [
  { label: 'Instagram', href: '#', icon: marketingAssets.socialInstagram },
  { label: 'Twitter', href: '#', icon: marketingAssets.socialTwitter },
  { label: 'Facebook', href: '#', icon: marketingAssets.socialFacebook },
  { label: 'YouTube', href: '#', icon: marketingAssets.socialYoutube },
];

const topNav = [
  { label: 'Products', href: '/#catalog' },
  { label: 'Workshop', href: customerAppPath('/auth/register') },
  { label: 'Design', href: customerAppPath('/auth/register') },
  { label: 'About', href: '/about' },
] as const;

interface MarketingShellProps {
  children: ReactNode;
  ctaTitle?: string;
  ctaBody?: string;
  ctaLabel?: string;
  ctaHref?: string;
}

export function MarketingShell({
  children,
  ctaTitle = 'Ready To Create Some Custom Apparel ?',
  ctaBody = '',
  ctaLabel = 'Get Started',
  ctaHref = customerAppPath('/auth/register'),
}: MarketingShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-black/10 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-6 px-6 py-5 lg:px-8">
          <Link href="/" className="shrink-0">
            <Image src={marketingAssets.headerLogo} alt="The Tamiym Workshop" width={125} height={32} className="h-8 w-[125px]" />
          </Link>
          <nav className="hidden items-center gap-10 lg:flex">
            {topNav.map((item) => (
              <Link key={item.label} href={item.href} className="text-sm font-bold uppercase text-tamiym-blue">
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href={customerAppPath('/auth/register')}
            className="inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-bold text-tamiym-blue"
          >
            Create An Account
          </Link>
        </div>
      </header>

      <main>{children}</main>

      <section className="border-t border-black/10 bg-white px-6 py-16 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <div className="overflow-hidden rounded-[2rem] bg-primary px-8 py-10 text-center text-white">
            <div className="relative">
              <div className="absolute -left-10 -top-20 h-40 w-40 rounded-full border-4 border-white/90" />
              <div className="absolute -left-4 -top-14 h-28 w-28 rounded-full border-4 border-white/90" />
              <div className="absolute -bottom-20 right-0 h-44 w-44 rounded-full border-4 border-white/90" />
              <div className="absolute -bottom-10 right-6 h-32 w-32 rounded-full border-4 border-white/90" />
              <div className="relative z-10 space-y-5">
                <h2 className="text-[2rem] font-bold leading-[1.2]">{ctaTitle}</h2>
                {ctaBody ? <p className="mx-auto max-w-xl text-sm leading-[1.5] text-white/90">{ctaBody}</p> : null}
                <Link
                  href={ctaHref}
                  className="inline-flex rounded-lg bg-accent px-4 py-2 text-sm font-bold text-tamiym-blue"
                >
                  {ctaLabel}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      <footer className="bg-tamiym-blue text-white">
        <div className="mx-auto max-w-7xl px-6 pb-10 pt-16 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[286px_repeat(4,minmax(0,1fr))]">
            <div className="space-y-8">
              <Image src={marketingAssets.footerLogo} alt="The Tamiym Workshop" width={203} height={52} className="h-[52px] w-[203px]" />
              <div className="flex gap-4">
                {socialLinks.map((item) => (
                  <Link
                    key={item.label}
                    href={item.href}
                    aria-label={item.label}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-full"
                  >
                    <Image src={item.icon} alt="" width={24} height={24} className="h-6 w-6" />
                  </Link>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-lg font-bold">Company</h3>
              <div className="space-y-3 text-sm">
                {footerLinks.company.map((item) => (
                  <Link key={item.label} href={item.href} className="block">
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-lg font-bold">Information</h3>
              <div className="space-y-3 text-sm">
                {footerLinks.information.map((item) => (
                  <Link key={item.label} href={item.href} className="block">
                    {item.label}
                  </Link>
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-lg font-bold">Payment Methods</h3>
              <div className="flex items-center gap-6">
                <Image src={marketingAssets.paymentMastercard} alt="Mastercard" width={48} height={29} className="h-7 w-12 object-contain" />
                <Image src={marketingAssets.paymentVisa} alt="Visa" width={48} height={48} className="h-7 w-12 object-contain" />
                <Image src={marketingAssets.paymentPaypal} alt="PayPal" width={48} height={36} className="h-7 w-12 object-contain" />
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="text-lg font-bold">Get In Touch</h3>
              <div className="space-y-3 text-sm">
                <p>info@tamiym.org</p>
                <p>+(234)-916-078-9709</p>
              </div>
            </div>
          </div>

          <div className="mt-10">
            <Image src={marketingAssets.footerLine} alt="" width={1235} height={2} className="h-px w-full" />
          </div>

          <div className="mt-8 flex flex-col items-start gap-4 text-sm text-white/90 sm:flex-row sm:items-center sm:justify-between">
            <Image src={marketingAssets.footerLogoAlt} alt="" width={203} height={52} className="hidden h-[52px] w-[203px] object-contain lg:block lg:opacity-0" />
            <p className="w-full text-center">Copyrights. All rights reserved</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
