'use client';

import { authApi, ApiError, getGoogleSignInUrl, GOOGLE_SIGN_IN_ERROR_MESSAGES } from '@/lib/auth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@tamiym/ui';

const registerSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Include at least one uppercase letter')
    .regex(/[a-z]/, 'Include at least one lowercase letter')
    .regex(/[0-9]/, 'Include at least one number')
    .regex(/[^A-Za-z0-9]/, 'Include at least one symbol'),
  firstName: z.string().min(1, 'First name is required'),
  lastName: z.string().min(1, 'Last name is required'),
});

type RegisterValues = z.infer<typeof registerSchema>;

function readGoogleSignInErrorFromUrl(): string | null {
  if (typeof window === 'undefined') return null;
  const code = new URLSearchParams(window.location.search).get('error');
  if (!code) return null;
  return GOOGLE_SIGN_IN_ERROR_MESSAGES[code] ?? 'Sign-in failed. Please try again.';
}

export default function RegisterPage() {
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
  } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      firstName: '',
      lastName: '',
    },
  });

  const onSubmit = async (values: RegisterValues) => {
    setError(null);

    try {
      await authApi.register({
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
      });
      router.push('/dashboard');
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-primary-50 via-background to-background px-4">
      <Card className="w-full max-w-lg">
        <CardHeader className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            Customer onboarding
          </p>
          <CardTitle>Create your account</CardTitle>
          <p className="text-sm text-muted-foreground">
            Or{' '}
            <Link href="/auth/login" className="font-medium text-primary hover:text-primary-700">
              sign in to your existing account
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
                <span className="relative z-10 bg-background px-2">or register with email</span>
                <span className="bg-border absolute top-1/2 right-0 left-0 z-0 h-px -translate-y-1/2" />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
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
                <Label htmlFor="firstName">First name</Label>
                <Input
                  id="firstName"
                  type="text"
                  autoComplete="given-name"
                  className="mt-2"
                  {...register('firstName')}
                />
                {errors.firstName ? (
                  <p className="mt-2 text-sm text-red-700">{errors.firstName.message}</p>
                ) : null}
              </div>

              <div>
                <Label htmlFor="lastName">Last name</Label>
                <Input
                  id="lastName"
                  type="text"
                  autoComplete="family-name"
                  className="mt-2"
                  {...register('lastName')}
                />
                {errors.lastName ? (
                  <p className="mt-2 text-sm text-red-700">{errors.lastName.message}</p>
                ) : null}
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="new-password"
                  className="mt-2"
                  {...register('password')}
                />
                {errors.password ? (
                  <p className="mt-2 text-sm text-red-700">{errors.password.message}</p>
                ) : (
                  <p className="mt-2 text-sm text-muted-foreground">
                    Use at least 8 characters with uppercase, lowercase, number, and symbol.
                  </p>
                )}
              </div>
            </div>

            <div>
              <Button type="submit" disabled={isSubmitting} className="w-full">
                {isSubmitting ? 'Creating account...' : 'Create account'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
