'use client';

import { authApi, ApiError, GOOGLE_SIGN_IN_ERROR_MESSAGES, getGoogleSignInUrl } from '@/lib/auth';
import { getSafeRedirectPath } from '@/lib/redirect-path';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
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
  GoogleOAuthButton,
  Input,
} from '@tamiym/ui';

const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginValues = z.infer<typeof loginSchema>;

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = getSafeRedirectPath(searchParams.get('next'), '/');
  const registerHref =
    next === '/' ? '/auth/register' : `/auth/register?next=${encodeURIComponent(next)}`;
  const oauthErrorCode = searchParams.get('error');

  const [error, setError] = useState<string | null>(() =>
    oauthErrorCode
      ? (GOOGLE_SIGN_IN_ERROR_MESSAGES[oauthErrorCode] ?? 'Sign-in failed. Please try again.')
      : null
  );
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    if (params.has('error')) {
      params.delete('error');
      const qs = params.toString();
      window.history.replaceState(
        null,
        '',
        qs ? `${window.location.pathname}?${qs}` : window.location.pathname
      );
    }
  }, []);

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (values: LoginValues) => {
    setError(null);

    try {
      await authApi.login(values);
      router.push(next);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Login failed. Please try again.');
    }
  };

  return (
    <AuthPageShell
      eyebrow="Customer access"
      title="Sign in to continue"
      description="Use your Tamiym account to continue from the public site into fundraiser checkout and future order tracking."
      meta={
        <p className="text-sm text-muted-foreground">
          New here?{' '}
          <Link
            href={registerHref}
            className="font-medium text-primary transition-colors hover:text-primary-700"
          >
            Create your account
          </Link>
        </p>
      }
      cardWidthClassName="max-w-md"
    >
      <FormProvider {...form}>
        <form className="space-y-6" onSubmit={form.handleSubmit(onSubmit)}>
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="text-sm text-red-700">{error}</p>
            </div>
          ) : null}

          <div className="space-y-3">
            <GoogleOAuthButton
              href={getGoogleSignInUrl(next)}
              title="Sign in with Google"
              subtitle="Use your Google account and return to the public site."
            />
            <div className="relative py-2 text-center text-xs text-muted-foreground">
              <span className="relative z-10 bg-white px-2">or use email</span>
              <span className="bg-border absolute top-1/2 right-0 left-0 z-0 h-px -translate-y-1/2" />
            </div>
          </div>

          <div className="space-y-4">
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

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <div className="flex items-center justify-between gap-3">
                    <FormLabel>Password</FormLabel>
                    <span className="text-xs text-muted-foreground">Use your account password</span>
                  </div>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="current-password"
                        className="pr-16"
                        placeholder="Enter your password"
                        {...field}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword((current: boolean) => !current)}
                        className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                      >
                        {showPassword ? 'Hide' : 'Show'}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <div className="space-y-3">
            <Button type="submit" disabled={isSubmitting} className="w-full">
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </Button>
            <p className="text-center text-xs leading-5 text-muted-foreground">
              Signing in here also keeps you authenticated if you later move into your customer
              workspace.
            </p>
          </div>
        </form>
      </FormProvider>
    </AuthPageShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
