'use client';

import { CustomerDashboardShell } from '@/components/customer-dashboard-shell';
import { activeNavForPath } from '@/lib/dashboard-nav';
import { displayNameOf, useRequireUser } from '@/lib/current-user';
import { Button } from '@tamiym/ui';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

/**
 * The customer sidebar lives here, once, so it stays mounted while people move between
 * dashboard pages (TTW-260). Pages render only their own content.
 */
export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { user, error, refetch } = useRequireUser();

  if (error && error.statusCode !== 401) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background">
        <p className="text-destructive">{error.message || 'Failed to load user data'}</p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <CustomerDashboardShell
      activeNav={activeNavForPath(pathname)}
      displayName={displayNameOf(user)}
    >
      {children}
    </CustomerDashboardShell>
  );
}
