'use client';

import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Input, Label } from '@tamiym/ui';
import { authApi, type ApiError } from '@/lib/auth';

/** Seconds the API makes the person wait between two codes. */
const RESEND_COOLDOWN_SECONDS = 60;

const codeSchema = z.object({
  code: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

type CodeValues = z.infer<typeof codeSchema>;

function verifyErrorMessage(error: unknown): string {
  const status = (error as ApiError | undefined)?.statusCode;
  if (status === 429) return 'Too many attempts. Please wait a few minutes, then try again.';
  if (status === 503)
    return 'The service is temporarily unavailable. Please try again in a moment.';
  if (status === 400) {
    return 'That code is invalid or has expired. Check the code, or request a new one.';
  }
  return 'We could not confirm your code. Please try again.';
}

function resendErrorMessage(error: unknown): string {
  const status = (error as ApiError | undefined)?.statusCode;
  if (status === 429) {
    return 'Please wait before asking for another code. You can request up to 5 codes an hour.';
  }
  if (status === 503)
    return 'The service is temporarily unavailable. Please try again in a moment.';
  return 'We could not send a new code. Please try again.';
}

interface SignupCodeFormProps {
  email: string;
  signupToken: string;
  /** Called once the API has accepted the code and opened the session. */
  onConfirmed: () => void;
  /** Called when the person wants to start over with another address. */
  onRestart: () => void;
}

export function SignupCodeForm({
  email,
  signupToken,
  onConfirmed,
  onRestart,
}: SignupCodeFormProps) {
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The wait is measured against the clock, not counted tick by tick, so a throttled background
  // tab still ends it on time.
  const [cooldownEndsAt, setCooldownEndsAt] = useState(
    () => Date.now() + RESEND_COOLDOWN_SECONDS * 1000
  );
  const [secondsLeft, setSecondsLeft] = useState(RESEND_COOLDOWN_SECONDS);
  const [resending, setResending] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<CodeValues>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  });

  useEffect(() => {
    const update = () =>
      setSecondsLeft(Math.max(0, Math.ceil((cooldownEndsAt - Date.now()) / 1000)));
    update();
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [cooldownEndsAt]);

  const onSubmit = async ({ code }: CodeValues) => {
    setError(null);
    setNotice(null);
    try {
      await authApi.signupVerify(signupToken, code);
      onConfirmed();
    } catch (err) {
      setError(verifyErrorMessage(err));
    }
  };

  const onResend = useCallback(async () => {
    setError(null);
    setNotice(null);
    setResending(true);
    try {
      await authApi.signupResend(signupToken);
      setNotice(
        'If your sign-up is still open, a new code is on its way and the previous one no longer works. You can ask for up to 5 codes an hour.'
      );
      setCooldownEndsAt(Date.now() + RESEND_COOLDOWN_SECONDS * 1000);
    } catch (err) {
      setError(resendErrorMessage(err));
    } finally {
      setResending(false);
    }
  }, [signupToken]);

  const resendDisabled = secondsLeft > 0 || resending;

  return (
    <form className="space-y-6" onSubmit={handleSubmit(onSubmit)} noValidate>
      <p className="text-sm text-muted-foreground">
        We sent a 6-digit code to <span className="font-medium text-foreground">{email}</span>.
        Enter it below to confirm your email address and finish creating your account. The code
        expires in 10 minutes.
      </p>

      {error && (
        <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}
      {notice && (
        <div role="status" className="rounded-xl border border-primary-100 bg-primary-50 p-4">
          <p className="text-sm text-foreground">{notice}</p>
        </div>
      )}

      <div>
        <Label htmlFor="signup-code">Confirmation code</Label>
        <Input
          id="signup-code"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          // The code is the only thing to do on this screen.
          autoFocus
          maxLength={6}
          className="mt-2 tracking-[0.5em]"
          aria-invalid={errors.code ? 'true' : 'false'}
          aria-describedby={errors.code ? 'signup-code-error' : undefined}
          {...register('code')}
        />
        {errors.code ? (
          <p id="signup-code-error" className="mt-2 text-sm text-destructive">
            {errors.code.message}
          </p>
        ) : null}
      </div>

      <Button type="submit" disabled={isSubmitting} className="w-full">
        {isSubmitting ? 'Confirming...' : 'Confirm and sign in'}
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm">
        <Button type="button" variant="outline" disabled={resendDisabled} onClick={onResend}>
          {secondsLeft > 0 ? `Resend code (${secondsLeft}s)` : 'Resend code'}
        </Button>
        <Button type="button" variant="ghost" onClick={onRestart}>
          Use a different email
        </Button>
      </div>
    </form>
  );
}
