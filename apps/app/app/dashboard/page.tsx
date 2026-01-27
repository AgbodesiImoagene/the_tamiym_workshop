'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authApi, User, ApiError } from '@/lib/auth';

export default function DashboardPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();
  }, [router]);

  const handleLogout = async () => {
    try {
      await authApi.logout();
      router.push('/auth/login');
    } catch (err) {
      console.error('Logout failed:', err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-zinc-600 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 dark:text-red-400">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-black">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-50">Dashboard</h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              Welcome back, {user?.firstName || user?.email}!
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="rounded-md bg-zinc-900 px-4 py-2 text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            Logout
          </button>
        </div>

        <div className="rounded-lg bg-white p-6 shadow dark:bg-zinc-900">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">Your Profile</h2>
          <dl className="mt-4 space-y-2">
            <div>
              <dt className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Email</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">{user?.email}</dd>
            </div>
            {user?.firstName && (
              <div>
                <dt className="text-sm font-medium text-zinc-600 dark:text-zinc-400">First Name</dt>
                <dd className="text-zinc-900 dark:text-zinc-50">{user.firstName}</dd>
              </div>
            )}
            {user?.lastName && (
              <div>
                <dt className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Last Name</dt>
                <dd className="text-zinc-900 dark:text-zinc-50">{user.lastName}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Role</dt>
              <dd className="text-zinc-900 dark:text-zinc-50">{user?.role}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
