'use client';

import { authApi, type ApiError, type User } from '@/lib/auth';
import { UserRole } from '@tamiym/types';
import { Button, Card, CardContent, cn } from '@tamiym/ui';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

type AdminNavKey =
  | 'overview'
  | 'orders'
  | 'campaigns'
  | 'payouts'
  | 'catalog'
  | 'pricing'
  | 'shipping'
  | 'moderation'
  | 'notifications'
  | 'settings';

interface AdminShellProps {
  activeNav: AdminNavKey;
  title: string;
  description?: string;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

interface AdminNavItem {
  key: AdminNavKey;
  label: string;
  href: string;
  hint: string;
}

const primaryNavItems: AdminNavItem[] = [
  { key: 'overview', label: 'Overview', href: '/admin', hint: 'Triage' },
  { key: 'orders', label: 'Orders', href: '/admin/orders', hint: 'Refunds and status' },
  { key: 'campaigns', label: 'Campaigns', href: '/admin/campaigns', hint: 'Review queue' },
  { key: 'payouts', label: 'Payouts', href: '/admin/payouts/runs', hint: 'Runs and adjustments' },
];

const secondaryNavItems: AdminNavItem[] = [
  {
    key: 'catalog',
    label: 'Catalog',
    href: '/admin/catalog/products',
    hint: 'Products and categories',
  },
  {
    key: 'pricing',
    label: 'Pricing',
    href: '/admin/pricing/discounts',
    hint: 'Discounts and bulk rules',
  },
  { key: 'shipping', label: 'Shipping', href: '/admin/shipping/zones', hint: 'Zones and rates' },
  {
    key: 'moderation',
    label: 'Moderation',
    href: '/admin/moderation/designs',
    hint: 'Design review',
  },
  {
    key: 'notifications',
    label: 'Notifications',
    href: '/admin/notifications',
    hint: 'Operational alerts',
  },
  { key: 'settings', label: 'Settings', href: '/admin/settings/site', hint: 'Site policies' },
];

function formatName(user: User | null) {
  if (!user) return 'Admin user';
  const fullName = [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
  return fullName || user.email;
}

export function formatAdminCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatAdminDate(value?: string | null) {
  if (!value) return 'Not recorded';
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function SidebarSection({
  label,
  items,
  activeNav,
}: {
  label: string;
  items: AdminNavItem[];
  activeNav: AdminNavKey;
}) {
  return (
    <div className="space-y-2">
      <p className="px-3 text-[11px] font-semibold uppercase tracking-[0.28em] text-white/45">
        {label}
      </p>
      <div className="space-y-1">
        {items.map((item) => {
          const active = item.key === activeNav;

          return (
            <Link
              key={item.key}
              href={item.href}
              className={cn(
                'block rounded-2xl border px-4 py-3 transition',
                active
                  ? 'border-accent bg-white text-tamiym-blue shadow-sm'
                  : 'border-white/10 bg-white/5 text-white/78 hover:border-white/20 hover:bg-white/8'
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-semibold">{item.label}</span>
                <span
                  className={cn(
                    'rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em]',
                    active ? 'bg-accent text-tamiym-blue' : 'bg-white/10 text-white/65'
                  )}
                >
                  {item.hint}
                </span>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}

export function AdminShell({ activeNav, title, description, actions, children }: AdminShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const breadcrumb = useMemo(() => {
    const parts = pathname.split('/').filter(Boolean);
    return parts.length ? parts.join(' / ') : 'admin';
  }, [pathname]);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      try {
        const currentUser = await authApi.getMe();
        if (cancelled) return;

        if (currentUser.role !== UserRole.ADMIN) {
          await authApi.logout();
          router.replace('/auth/login');
          return;
        }

        setUser(currentUser);
      } catch (error) {
        const apiError = error as ApiError;
        if (apiError.statusCode === 401) {
          router.replace('/auth/login');
          return;
        }
        setAuthError(apiError.message || 'Unable to verify admin session.');
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadUser();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function handleLogout() {
    try {
      await authApi.logout();
      router.push('/auth/login');
    } catch {
      setAuthError('We could not sign you out right now.');
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 text-sm text-white/70">
        Loading admin workspace...
      </div>
    );
  }

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-4">
        <Card className="w-full max-w-lg rounded-[1.75rem] border-white/10 bg-white">
          <CardContent className="space-y-4 p-8">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
                Admin access
              </p>
              <h1 className="text-2xl font-semibold text-tamiym-blue">Session check failed</h1>
            </div>
            <p className="text-sm text-black/70">{authError}</p>
            <div className="flex gap-3">
              <Link
                href="/auth/login"
                className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-medium text-accent-foreground"
              >
                Go to sign in
              </Link>
              <Button variant="secondary" onClick={() => router.refresh()}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f3f6fb] text-black">
      <div className="grid min-h-screen lg:grid-cols-[280px_minmax(0,1fr)]">
        <aside className="border-r border-white/10 bg-slate-950 px-5 py-6 text-white">
          <div className="space-y-6">
            <Link href="/admin" className="block rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-accent">
                Tamiym Admin
              </p>
              <p className="mt-3 text-xl font-semibold">Operations Console</p>
              <p className="mt-2 text-sm text-white/65">
                Queue-driven admin surface for orders, campaigns, and payouts.
              </p>
            </Link>

            <SidebarSection label="Core work" items={primaryNavItems} activeNav={activeNav} />
            <SidebarSection label="Later domains" items={secondaryNavItems} activeNav={activeNav} />
          </div>
        </aside>

        <div className="min-w-0">
          <header className="border-b border-black/8 bg-white/90 px-6 py-5 backdrop-blur lg:px-8">
            <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-black/45">
                  {breadcrumb}
                </p>
                <div className="space-y-1">
                  <h1 className="text-3xl font-semibold tracking-[-0.03em] text-tamiym-blue">
                    {title}
                  </h1>
                  {description ? (
                    <p className="max-w-3xl text-sm leading-6 text-black/65">{description}</p>
                  ) : null}
                </div>
              </div>

              <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
                {actions}
                <div className="rounded-2xl border border-black/8 bg-[#f7f9fc] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Signed in as
                  </p>
                  <p className="mt-1 text-sm font-semibold text-tamiym-blue">{formatName(user)}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <span className="rounded-full bg-tamiym-blue px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-white">
                      {user?.role}
                    </span>
                    <button
                      type="button"
                      onClick={() => void handleLogout()}
                      className="text-xs font-semibold text-black/55 transition hover:text-black"
                    >
                      Sign out
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </header>

          <main className="px-6 py-8 lg:px-8">{children}</main>
        </div>
      </div>
    </div>
  );
}
