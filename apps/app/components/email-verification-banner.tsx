'use client';

import { authApi } from '@/lib/auth';
import { EMAIL_NOT_VERIFIED_MESSAGE } from '@/lib/email-verification';
import { Button } from '@tamiym/ui';
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';

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

  async function resend() {
    setState('sending');
    try {
      await authApi.resendVerification(email);
      setState('sent');
    } catch (err) {
      setState((err as { statusCode?: number }).statusCode === 429 ? 'throttled' : 'failed');
    }
  }

  return (
    <div role="status" className="space-y-2 text-sm">
      <p>{message}</p>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="sm" onClick={resend} disabled={state === 'sending'}>
          {state === 'sending' ? 'Sending…' : 'Resend link'}
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
  const { data: user } = useQuery({ queryKey: ['auth', 'me'], queryFn: () => authApi.getMe() });

  if (!user || user.emailVerified !== false) {
    return null;
  }

  return (
    <div className="border-b border-warning bg-warning/10 px-4 py-3 text-foreground">
      <EmailVerificationNotice email={user.email} />
    </div>
  );
}
