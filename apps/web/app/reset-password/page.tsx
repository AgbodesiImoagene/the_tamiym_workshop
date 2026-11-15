'use client';

import { authApi } from '@/lib/auth';
import {
  RESET_ERROR_MESSAGES,
  classifyResetError,
  resetPasswordSchema,
  type ResetPasswordValues,
} from '@/lib/password-reset';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  AuthPageShell,
  Button,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormProvider,
  Input,
} from '@tamiym/ui';

type Status = 'form' | 'success' | 'invalid-link';

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  // Read the token once, then take it out of the address bar and history.
  const [token] = useState(() => searchParams.get('token')?.trim() ?? '');
  const [status, setStatus] = useState<Status>(token ? 'form' : 'invalid-link');
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has('token')) {
      params.delete('token');
      const qs = params.toString();
      window.history.replaceState(
        null,
        '',
        qs ? `${window.location.pathname}?${qs}` : window.location.pathname
      );
    }
  }, []);

  const form = useForm<ResetPasswordValues>({
    resolver: zodResolver(resetPasswordSchema),
    defaultValues: { newPassword: '', confirmPassword: '' },
  });
  const { isSubmitting } = form.formState;

  const onSubmit = async (values: ResetPasswordValues) => {
    setError(null);
    try {
      await authApi.resetPassword(token, values.newPassword);
      setStatus('success');
    } catch (err) {
      const kind = classifyResetError(err);
      if (kind === 'invalid-link') {
        setStatus('invalid-link');
      } else {
        setError(RESET_ERROR_MESSAGES[kind]);
      }
    }
  };

  if (status === 'invalid-link') {
    return (
      <AuthPageShell
        eyebrow="Customer access"
        title="Link not valid"
        description="Reset links work once and stay valid for one hour."
        cardWidthClassName="max-w-md"
      >
        <div className="space-y-4">
          <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4">
            <p className="text-sm text-red-700">
              This reset link is invalid or has expired. If you reloaded this page, open the link
              from your email again, or request a new one.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link href="/auth/forgot-password">Request a new link</Link>
          </Button>
        </div>
      </AuthPageShell>
    );
  }

  if (status === 'success') {
    return (
      <AuthPageShell
        eyebrow="Customer access"
        title="Password updated"
        description="You can now sign in with your new password."
        cardWidthClassName="max-w-md"
      >
        <div className="space-y-4">
          <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-sm text-emerald-800">
              Your password has been reset. For your security, you were signed out on every device.
            </p>
          </div>
          <Button asChild className="w-full">
            <Link href="/auth/login">Sign in</Link>
          </Button>
        </div>
      </AuthPageShell>
    );
  }

  return (
    <AuthPageShell
      eyebrow="Customer access"
      title="Choose a new password"
      description="Pick a strong password you have not used elsewhere."
      cardWidthClassName="max-w-md"
    >
      <FormProvider {...form}>
        <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
          {error ? (
            <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ) : null}

          <div className="space-y-4">
            <FormField
              control={form.control}
              name="newPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>New password</FormLabel>
                  <div className="relative">
                    <FormControl>
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        className="pr-16"
                        {...field}
                      />
                    </FormControl>
                    <button
                      type="button"
                      onClick={() => setShowPassword((current: boolean) => !current)}
                      aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                      className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm new password</FormLabel>
                  <FormControl>
                    <Input
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="new-password"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <Button type="submit" disabled={isSubmitting} className="w-full">
            {isSubmitting ? 'Saving...' : 'Reset password'}
          </Button>
        </form>
      </FormProvider>
    </AuthPageShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
