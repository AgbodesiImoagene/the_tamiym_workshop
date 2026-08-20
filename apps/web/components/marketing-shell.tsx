import type { ReactNode } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { marketingAssets } from '@/lib/assets';
import { customerAppPath, webRegisterWithNext } from '@/lib/site';
import { MarketingHeader } from '@/components/marketing-header';
import { MarketingCtaCard } from '@/components/marketing-cta-card';

const footerLinks = {
  company: [
    { label: 'About', href: '/about' },
    { label: 'Fundraisers', href: '/fundraiser' },
    { label: 'Workshop', href: customerAppPath('/auth/register') },
    { label: 'Contact Us', href: 'mailto:info@tamiym.org' },
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
  ctaHref = webRegisterWithNext('/'),
}: MarketingShellProps) {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <MarketingHeader />

      <main>{children}</main>

      {/* ~Half the CTA sits on white (padding reserves space), half on navy: center on the seam */}
      <div className="relative z-20 bg-background">
        <div className="relative mx-auto max-w-7xl px-6 pb-[clamp(6.5rem,18vw,9.5rem)] lg:px-8 lg:pb-[clamp(7rem,16vw,10rem)]">
          <div className="absolute bottom-0 left-1/2 z-20 w-full max-w-3xl -translate-x-1/2 translate-y-1/2 px-0 sm:px-4 lg:px-6">
            <MarketingCtaCard
              title={ctaTitle}
              body={ctaBody || undefined}
              ctaLabel={ctaLabel}
              ctaHref={ctaHref}
            />
          </div>
        </div>
      </div>

      <footer className="relative z-10 bg-tamiym-blue pt-[clamp(7.5rem,20vw,11rem)] text-white lg:pt-[clamp(8rem,18vw,11.5rem)]">
        <div className="mx-auto max-w-7xl px-6 pb-10 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-[286px_repeat(4,minmax(0,1fr))]">
            <div className="space-y-8">
              <Image
                src={marketingAssets.footerLogo}
                alt="The Tamiym Workshop"
                width={203}
                height={52}
                className="h-[52px] w-[203px]"
              />
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
                <Image
                  src={marketingAssets.paymentMastercard}
                  alt="Mastercard"
                  width={48}
                  height={29}
                  className="h-7 w-12 object-contain"
                />
                <Image
                  src={marketingAssets.paymentVisa}
                  alt="Visa"
                  width={48}
                  height={48}
                  className="h-7 w-12 object-contain"
                />
                <Image
                  src={marketingAssets.paymentPaypal}
                  alt="PayPal"
                  width={48}
                  height={36}
                  className="h-7 w-12 object-contain"
                />
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
            <Image
              src={marketingAssets.footerLine}
              alt=""
              width={1235}
              height={2}
              className="h-px w-full"
            />
          </div>

          <div className="mt-8 flex flex-col items-start gap-4 text-sm text-white/90 sm:flex-row sm:items-center sm:justify-between">
            <p className="w-full text-center">Copyrights. All rights reserved</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
