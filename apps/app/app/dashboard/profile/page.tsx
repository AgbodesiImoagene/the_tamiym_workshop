'use client';

import { CustomerDashboardShell } from '@/components/customer-dashboard-shell';
import { CustomerSettingsForm } from '@/components/customer-settings-form';
import { authApi, ApiError, User } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function DashboardProfilePage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authApi.getMe();
        setUser(userData);
      } catch (err) {
        const apiError = err as ApiError;
        if (apiError.statusCode === 401) {
          router.push('/auth/login');
        } else {
          setError(apiError.message || 'Failed to load user data');
        }
      }
    };

    void fetchUser();
  }, [router]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <CustomerDashboardShell
      activeNav="home"
      displayName={user?.firstName || user?.email?.split('@')[0] || 'Borngreat'}
    >
      <CustomerSettingsForm
        pageTitle="Profile"
        personalTitle="Personal Information"
        passwordTitle="Password"
        shippingTitle="Shipping Information"
      />
    </CustomerDashboardShell>
  );
}
