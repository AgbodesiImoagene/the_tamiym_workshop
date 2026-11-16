'use client';

import { authApi } from '@/lib/auth';
import {
  FORGOT_PASSWORD_SUCCESS_MESSAGE,
  RESET_ERROR_MESSAGES,
  classifyResetError,
  forgotPasswordSchema,
  type ForgotPasswordValues,
} from '@/lib/password-reset';
import Link from 'next/link';
import { useState } from 'react';
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

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const form = useForm<ForgotPasswordValues>({
    resolver: zodResolver(forgotPasswordSchema),
    defaultValues: { email: '' },
  });
  const { isSubmitting } = form.formState;

  const onSubmit = async (values: ForgotPasswordValues) => {
    setError(null);
    try {
      await authApi.forgotPassword(values.email);
      setSent(true);
    } catch (err) {
      const kind = classifyResetError(err);
      setError(RESET_ERROR_MESSAGES[kind === 'rate-limited' ? 'rate-limited' : 'unexpected']);
    }
  };

  return (
    <AuthPageShell
      eyebrow="Customer access"
      title="Reset your password"
      description="Enter the email you signed up with and we will send you a link to choose a new password."
      meta={
        <p className="text-sm text-muted-foreground">
          Remembered it?{' '}
          <Link
            href="/auth/login"
            className="font-medium text-primary transition-colors hover:text-primary-700"
          >
            Back to sign in
          </Link>
        </p>
      }
      cardWidthClassName="max-w-md"
    >
      {sent ? (
        <div role="status" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
          <p className="text-sm text-emerald-800">{FORGOT_PASSWORD_SUCCESS_MESSAGE}</p>
        </div>
      ) : (
        <FormProvider {...form}>
          <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
            {error ? (
              <div role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            ) : null}

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email address</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="you@example.com"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Sending...' : 'Send reset link'}
            </Button>
          </form>
        </FormProvider>
      )}
    </AuthPageShell>
  );
}
