'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { ApiError, User, authApi } from '@/lib/auth';
import { getSafeRedirectPath } from '@/lib/redirect-path';
import { webLoginWithNext } from '@/lib/site';
import { AuthPageShell, Button } from '@tamiym/ui';

function VerifyGateContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = getSafeRedirectPath(searchParams.get('next'), '/');
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const me = await authApi.getMe();
        if (cancelled) return;
        if (me.emailVerified) {
          router.replace(next);
          return;
        }
        setUser(me);
      } catch (err) {
        const apiError = err as ApiError;
        if (apiError.statusCode === 401) {
          router.replace(webLoginWithNext(`/auth/verify?next=${encodeURIComponent(next)}`));
          return;
        }
        if (!cancelled) setError(apiError.message || 'Failed to load session');
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [next, router]);

  async function handleResend() {
    if (!user?.email) return;
    setSending(true);
    setError(null);
    setMessage(null);
    try {
      const result = await authApi.resendVerification(user.email);
      setMessage(result.message);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Could not resend verification email');
    } finally {
      setSending(false);
    }
  }

  return (
    <AuthPageShell
      eyebrow="Email verification"
      title="Verify your email to checkout"
      description="Campaign orders require a verified email. Check your inbox, or resend the verification link, then continue."
      cardWidthClassName="max-w-md"
    >
      <div className="space-y-4">
        {error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            {error}
          </div>
        ) : null}
        {message ? (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
            {message}
          </div>
        ) : null}
        <p className="text-sm text-muted-foreground">
          Signed in as <span className="font-medium text-foreground">{user?.email || '…'}</span>
        </p>
        <Button
          type="button"
          className="w-full"
          disabled={sending || !user}
          onClick={() => void handleResend()}
        >
          {sending ? 'Sending…' : 'Resend verification email'}
        </Button>
        <Button
          type="button"
          className="w-full"
          onClick={() => {
            void (async () => {
              try {
                const me = await authApi.getMe();
                if (me.emailVerified) {
                  router.replace(next);
                } else {
                  setError('Email is not verified yet. Open the link from your inbox first.');
                }
              } catch (err) {
                const apiError = err as ApiError;
                setError(apiError.message || 'Could not refresh verification status');
              }
            })();
          }}
        >
          I have verified — continue
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          Open the link from your email (or{' '}
          <Link href={`/verify-email?next=${encodeURIComponent(next)}`} className="underline">
            paste the token page
          </Link>
          ), then return here.
        </p>
      </div>
    </AuthPageShell>
  );
}

export default function AuthVerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <VerifyGateContent />
    </Suspense>
  );
}
