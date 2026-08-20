'use client';

import Image from 'next/image';
import Link from 'next/link';
import { marketingAssets } from '@/lib/assets';
import { customerAppPath, webLoginWithNext, webRegisterWithNext } from '@/lib/site';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@tamiym/ui';

const navItems = [
  { label: 'Workshop', href: customerAppPath('/auth/register') },
  { label: 'Fundraisers', href: '/fundraiser' },
  { label: 'About', href: '/about' },
] as const;

export function MarketingHeader() {
  return (
    <header className="sticky top-0 z-50 border-b border-black/10 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-6 py-4 lg:gap-6 lg:py-5 lg:px-8">
        <Link href="/" className="shrink-0">
          <Image
            src={marketingAssets.headerLogo}
            alt="The Tamiym Workshop"
            width={125}
            height={32}
            className="h-8 w-[125px]"
          />
        </Link>

        <nav className="hidden items-center gap-10 lg:flex" aria-label="Primary">
          {navItems.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-sm font-bold uppercase text-tamiym-blue"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <Link
            href={webRegisterWithNext('/')}
            className="inline-flex rounded-lg bg-accent px-3 py-2 text-xs font-bold text-tamiym-blue sm:px-4 sm:text-sm"
          >
            Create An Account
          </Link>

          <Sheet>
            <SheetTrigger
              className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-black/15 text-tamiym-blue lg:hidden"
              aria-label="Open menu"
            >
              <span className="flex flex-col gap-1.5" aria-hidden>
                <span className="block h-0.5 w-5 bg-current" />
                <span className="block h-0.5 w-5 bg-current" />
                <span className="block h-0.5 w-5 bg-current" />
              </span>
            </SheetTrigger>

            <SheetContent side="right" className="w-72 px-6 py-6">
              <SheetHeader className="mb-6">
                <SheetTitle className="text-left text-base font-bold text-tamiym-blue">
                  Menu
                </SheetTitle>
              </SheetHeader>
              <nav className="flex flex-col gap-1" aria-label="Mobile primary">
                {navItems.map((item) => (
                  <SheetTrigger key={item.label} asChild>
                    <Link
                      href={item.href}
                      className="rounded-lg px-3 py-3 text-sm font-bold uppercase text-tamiym-blue hover:bg-black/5"
                    >
                      {item.label}
                    </Link>
                  </SheetTrigger>
                ))}
                <SheetTrigger asChild>
                  <Link
                    href={webLoginWithNext('/')}
                    className="rounded-lg px-3 py-3 text-sm font-semibold text-tamiym-blue/90 hover:bg-black/5"
                  >
                    Sign in
                  </Link>
                </SheetTrigger>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  );
}
