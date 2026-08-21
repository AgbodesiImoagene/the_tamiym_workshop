'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import { ApiError, authApi } from '@/lib/auth';
import { getSafeRedirectPath } from '@/lib/redirect-path';
import { AuthPageShell, Button, Input } from '@tamiym/ui';

function VerifyEmailContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = getSafeRedirectPath(searchParams.get('next'), '/');
  const tokenFromQuery = searchParams.get('token') || '';
  const [token, setToken] = useState(tokenFromQuery);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setToken(tokenFromQuery);
  }, [tokenFromQuery]);

  async function handleVerify(event: FormEvent) {
    event.preventDefault();
    if (!token.trim()) {
      setError('Paste the verification token from your email.');
      return;
    }
    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      const result = await authApi.verifyEmail(token.trim());
      setMessage(result.message);
      router.replace(next);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Verification failed. The link may be expired.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthPageShell
      eyebrow="Email verification"
      title="Confirm your email"
      description="Use the token from your verification email to unlock fundraiser checkout."
      cardWidthClassName="max-w-md"
    >
      <form className="space-y-4" onSubmit={(event) => void handleVerify(event)}>
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
        <label className="space-y-2 text-sm font-medium">
          <span>Verification token</span>
          <Input
            value={token}
            onChange={(event) => setToken(event.target.value)}
            placeholder="Paste token"
            autoComplete="one-time-code"
          />
        </label>
        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Verifying…' : 'Verify email'}
        </Button>
      </form>
    </AuthPageShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <VerifyEmailContent />
    </Suspense>
  );
}
