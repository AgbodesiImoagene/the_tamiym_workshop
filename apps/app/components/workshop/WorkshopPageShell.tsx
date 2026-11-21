'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { CustomerDashboardShell } from '@/components/customer-dashboard-shell';
import { authApi, type ApiError, type User } from '@/lib/auth';

/**
 * Puts a workshop page inside the customer dashboard (sidebar), as in the Figma screens (TTW-105).
 * The editor itself loads without waiting for the user: only the name in the sidebar does.
 */
export default function WorkshopPageShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    authApi
      .getMe()
      .then(setUser)
      .catch((err: ApiError) => {
        if (err.statusCode === 401) router.push('/auth/login');
      });
  }, [router]);

  return (
    <CustomerDashboardShell
      activeNav="design"
      displayName={user?.firstName || user?.email?.split('@')[0] || ''}
    >
      {children}
    </CustomerDashboardShell>
  );
}
