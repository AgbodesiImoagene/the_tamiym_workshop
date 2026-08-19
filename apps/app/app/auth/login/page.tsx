'use client';

import { authApi, ApiError, getGoogleSignInUrl, GOOGLE_SIGN_IN_ERROR_MESSAGES } from '@/lib/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@tamiym/ui';

const loginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type LoginValues = z.infer<typeof loginSchema>;

function readGoogleSignInErrorFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const code = new URLSearchParams(window.location.search).get('error');
  if (!code) return null;
  return GOOGLE_SIGN_IN_ERROR_MESSAGES[code] ?? 'Sign-in failed. Please try again.';
}

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(readGoogleSignInErrorFromUrl);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!new URLSearchParams(window.location.search).get('error')) return;
    window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginValues) => {
    setError(null);

    try {
      await authApi.login(values);
      router.push('/dashboard');
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Login failed. Please try again.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-primary-50 via-background to-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            Customer access
          </p>
          <CardTitle>Sign in to your account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Or{' '}
            <Link href="/auth/register" className="font-medium text-primary hover:text-primary-700">
              create a new account
            </Link>
          </p>
        </CardHeader>

        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

            <div className="space-y-3">
              <a
                href={getGoogleSignInUrl('/dashboard')}
                className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-border bg-background text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-primary-50 focus-visible:outline-hidden focus-visible:ring-4 focus-visible:ring-primary/20"
              >
                Continue with Google
              </a>
              <div className="relative py-2 text-center text-xs text-muted-foreground">
                <span className="relative z-10 bg-background px-2">or use email</span>
                <span className="bg-border absolute top-1/2 right-0 left-0 z-0 h-px -translate-y-1/2" />
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <Label htmlFor="email">Email address</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  className="mt-2"
                  {...register('email')}
                />
                {errors.email ? (
                  <p className="mt-2 text-sm text-red-700">{errors.email.message}</p>
                ) : null}
              </div>

              <div>
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  className="mt-2"
                  {...register('password')}
                />
                {errors.password ? (
                  <p className="mt-2 text-sm text-red-700">{errors.password.message}</p>
                ) : null}
              </div>
            </div>

            <div>
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? 'Signing in...' : 'Sign in'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
