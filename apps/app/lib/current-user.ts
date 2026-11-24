'use client';

/**
 * The signed-in user for the customer app (TTW-260).
 *
 * One cached `/auth/me` serves the sidebar, the verification banner and every page, so
 * navigating between dashboard pages does not ask the API again.
 * - `useCurrentUser()` only reads: any number of components can call it.
 * - `useRequireUser()` also owns the redirect to the login page on a 401, and is used by the
 *   dashboard layout and the payment confirmation page only.
 */
import { queryOptions, useQuery } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { authApi, type ApiError, type User } from './auth';
import { resetSession } from './session-reset';

const AUTH_ME_STALE_MS = 60_000;

export const authMeQueryOptions = queryOptions({
  queryKey: ['auth', 'me'],
  queryFn: () => authApi.getMe(),
  staleTime: AUTH_ME_STALE_MS,
  // A 401 means "not signed in": retrying only delays the redirect.
  retry: (failureCount, error) => (error as ApiError).statusCode !== 401 && failureCount < 1,
});

export function displayNameOf(user: User | undefined): string | undefined {
  return user?.firstName || user?.email?.split('@')[0] || undefined;
}

export function useCurrentUser() {
  const query = useQuery(authMeQueryOptions);
  return {
    user: query.data,
    isLoading: query.isPending,
    error: (query.error as ApiError | null) ?? null,
    refetch: query.refetch,
  };
}

export function useRequireUser() {
  const router = useRouter();
  const current = useCurrentUser();
  const redirected = useRef(false);
  const unauthorized = current.error?.statusCode === 401;

  useEffect(() => {
    if (!unauthorized || redirected.current) return;
    redirected.current = true;
    resetSession();
    router.push('/auth/login');
  }, [unauthorized, router]);

  return current;
}
