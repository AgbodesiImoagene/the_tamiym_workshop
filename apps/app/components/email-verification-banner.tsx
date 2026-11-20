'use client';

import { authApi } from '@/lib/auth';
import { EMAIL_NOT_VERIFIED_MESSAGE } from '@/lib/email-verification';
import { Button } from '@tamiym/ui';
import { useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

/** Seconds before another link can be requested after one was sent. */
const RESEND_COOLDOWN_SECONDS = 30;

type ResendState = 'idle' | 'sending' | 'sent' | 'throttled' | 'failed';

const RESEND_FEEDBACK: Record<'sent' | 'throttled' | 'failed', string> = {
  sent: 'We sent a new link. Check your inbox (and spam folder).',
  throttled: 'Too many requests. Please wait a few minutes before asking for another link.',
  failed: 'We could not send the link. Please try again.',
};

/** Explanation plus the resend action, shared by the banner and the checkout. */
export function EmailVerificationNotice({
  email,
  message = EMAIL_NOT_VERIFIED_MESSAGE,
}: {
  email: string;
  message?: string;
}) {
  const [state, setState] = useState<ResendState>('idle');
  const [cooldown, setCooldown] = useState(0);
  const cooling = cooldown > 0;

  useEffect(() => {
    if (!cooling) return;
    const timer = setInterval(() => setCooldown((seconds) => Math.max(0, seconds - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooling]);

  async function resend() {
    setState('sending');
    try {
      await authApi.resendVerification(email);
      setState('sent');
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setState((err as { statusCode?: number }).statusCode === 429 ? 'throttled' : 'failed');
    }
  }

  return (
    <div role="status" className="space-y-2 text-sm">
      <p>{message}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={resend} disabled={state === 'sending' || cooling}>
          {state === 'sending' ? 'Sending…' : cooling ? `Resend in ${cooldown}s` : 'Resend link'}
        </Button>
        {state === 'sent' ? <span>{RESEND_FEEDBACK.sent}</span> : null}
        {state === 'throttled' || state === 'failed' ? (
          <span role="alert" className="text-destructive">
            {RESEND_FEEDBACK[state]}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** Shown on every dashboard page while the API reports the email as unverified. */
export function EmailVerificationBanner() {
  const { data: user } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => authApi.getMe(),
    // Back from the verification link in another tab: drop the banner without a reload.
    refetchOnWindowFocus: true,
  });

  if (!user || user.emailVerified !== false) {
    return null;
  }

  return (
    <div className="border-b border-warning bg-warning/10 px-4 py-3 text-foreground">
      <EmailVerificationNotice email={user.email} />
    </div>
  );
}
