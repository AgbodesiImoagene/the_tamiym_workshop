'use client';

import { authApi } from '@/lib/auth';
import { customerAssets } from '@/lib/assets';
import { Button, cn } from '@tamiym/ui';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReactNode } from 'react';

type NavKey = 'home' | 'products' | 'design' | 'orders' | 'fundraiser' | 'cart';

interface CustomerDashboardShellProps {
  activeNav: NavKey;
  displayName: string;
  children: ReactNode;
}

const desktopNavItems: Array<{
  key: NavKey;
  label: string;
  href?: string;
  icon: () => ReactNode;
}> = [
  { key: 'home', label: 'Home', href: '/dashboard', icon: HomeIcon },
  { key: 'products', label: 'Products', href: '/dashboard/products', icon: GridIcon },
  { key: 'cart', label: 'Cart', href: '/dashboard/cart', icon: CartIcon },
  { key: 'design', label: 'Design', href: '/dashboard/design', icon: PenIcon },
  { key: 'orders', label: 'Orders', href: '/dashboard/orders', icon: TruckIcon },
  { key: 'fundraiser', label: 'Fundraiser', href: '/dashboard/fundraiser', icon: CreditCardIcon },
];

export function CustomerDashboardShell({
  activeNav,
  displayName,
  children,
}: CustomerDashboardShellProps) {
  const router = useRouter();

  async function handleLogout() {
    try {
      await authApi.logout();
      router.push('/auth/login');
    } catch (error) {
      console.error('Logout failed:', error);
    }
  }

  return (
    <main className="min-h-screen bg-white text-black">
      <div className="lg:flex">
        <aside className="hidden min-h-screen w-[300px] flex-col justify-between bg-black px-[15px] py-12 text-white lg:flex">
          <div className="space-y-10">
            <div className="flex items-center gap-3 px-1">
              <Image src={customerAssets.profileIcon} alt="" width={40} height={40} className="h-10 w-10 shrink-0 rounded-full" />
              <p className="text-base font-medium">{displayName}</p>
            </div>

            <nav className="space-y-8">
              {desktopNavItems.map(({ key, label, href, icon: Icon }) => {
                const isActive = key === activeNav;
                const content = (
                  <span
                    className={cn(
                      'flex h-10 w-full items-center gap-2 rounded-b-[10px] border-b px-4 text-left text-base font-medium transition',
                      isActive
                        ? 'border-white bg-white text-[#004385]'
                        : 'border-white text-white hover:bg-white/10',
                    )}
                  >
                    <Icon />
                    <span>{label}</span>
                  </span>
                );

                return href ? (
                  <Link key={key} href={href}>
                    {content}
                  </Link>
                ) : (
                  <button key={key} type="button" className="w-full text-left">
                    {content}
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="space-y-6">
            <div
              className="mx-auto h-[280px] w-full max-w-[240px] bg-contain bg-center bg-no-repeat"
              style={{ backgroundImage: `url(${customerAssets.sidebarIllustration})` }}
            />
            <div className="flex items-center justify-between">
              <Image
                src={customerAssets.desktopFooterLogo}
                alt="The Tamiym Workshop"
                width={125}
                height={32}
                className="h-8 w-[125px] object-contain"
              />
              <Button
                variant="ghost"
                onClick={handleLogout}
                className="h-10 w-10 rounded-full border border-white/20 p-0 text-white hover:bg-white/10"
              >
                <span className="sr-only">Logout</span>
                <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M10 17 15 12 10 7" />
                  <path d="M15 12H3" />
                  <path d="M20 4v16" />
                </svg>
              </Button>
            </div>
          </div>
        </aside>

        <section className="min-h-screen flex-1">
          <div className="mx-auto max-w-[1100px] px-4 pb-20 pt-4 sm:px-6 lg:px-10 lg:pb-24 lg:pt-[48px]">
            <div className="flex items-center justify-between lg:hidden">
              <Image
                src={customerAssets.mobileHeaderLogo}
                alt="The Tamiym Workshop"
                width={70}
                height={18}
                className="h-[18px] w-[70px] object-contain"
              />
              <div className="flex items-center gap-3">
                <button type="button" className="rounded-full p-1.5">
                  <BellIcon />
                </button>
                <button type="button" className="rounded-full p-1.5">
                  <MenuIcon />
                </button>
              </div>
            </div>

            {children}
          </div>
        </section>
      </div>
    </main>
  );
}

export function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M3 10.5 12 4l9 6.5" />
      <path d="M5 9.5V20h5v-6h4v6h5V9.5" />
    </svg>
  );
}

export function GridIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="4" y="4" width="7" height="7" rx="1" />
      <rect x="13" y="4" width="7" height="7" rx="1" />
      <rect x="4" y="13" width="7" height="7" rx="1" />
      <rect x="13" y="13" width="7" height="7" rx="1" />
    </svg>
  );
}

export function PenIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="m3 21 3.7-1 11-11a2.1 2.1 0 0 0-3-3l-11 11L3 21Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

export function TruckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M10 17H5V6h9v11h-1" />
      <path d="M14 9h4l3 3v5h-2" />
      <circle cx="7.5" cy="17.5" r="1.5" />
      <circle cx="17.5" cy="17.5" r="1.5" />
    </svg>
  );
}

export function CreditCardIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M3 10h18" />
    </svg>
  );
}

export function CartIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="9" cy="19" r="1.5" />
      <circle cx="17" cy="19" r="1.5" />
      <path d="M3 5h2l2.4 10.2a1 1 0 0 0 1 .8h8.9a1 1 0 0 0 1-.8L20 8H7" />
    </svg>
  );
}

function BellIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M6 8a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7" />
      <path d="M10 19a2 2 0 0 0 4 0" />
    </svg>
  );
}

function MenuIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M4 7h16" />
      <path d="M4 12h16" />
      <path d="M4 17h16" />
    </svg>
  );
}
