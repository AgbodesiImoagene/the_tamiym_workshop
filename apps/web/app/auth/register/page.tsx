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
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormProvider,
  GoogleOAuthButton,
  Input,
} from '@tamiym/ui';

const registerSchema = z
  .object({
    email: z.email('Enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .regex(/[A-Z]/, 'Include at least one uppercase letter')
      .regex(/[a-z]/, 'Include at least one lowercase letter')
      .regex(/[0-9]/, 'Include at least one number')
      .regex(/[^A-Za-z0-9]/, 'Include at least one symbol'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    firstName: z.string().min(1, 'First name is required'),
    lastName: z.string().min(1, 'Last name is required'),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type RegisterValues = z.infer<typeof registerSchema>;

function RegisterPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = getSafeRedirectPath(searchParams.get('next'), '/');
  const loginHref = next === '/' ? '/auth/login' : `/auth/login?next=${encodeURIComponent(next)}`;
  const oauthErrorCode = searchParams.get('error');

  const [error, setError] = useState<string | null>(() =>
    oauthErrorCode
      ? (GOOGLE_SIGN_IN_ERROR_MESSAGES[oauthErrorCode] ?? 'Sign-in failed. Please try again.')
      : null
  );
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

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

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: '',
      password: '',
      confirmPassword: '',
      firstName: '',
      lastName: '',
    },
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (values: RegisterValues) => {
    setError(null);

    try {
      await authApi.register({
        email: values.email,
        password: values.password,
        firstName: values.firstName,
        lastName: values.lastName,
      });
      router.push(next);
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.statusCode === 429) {
        setError(
          'You have tried signing up a few times too quickly. Please wait a minute and try again.'
        );
        return;
      }
      setError(apiError.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <AuthPageShell
      eyebrow="Customer onboarding"
      title="Create your account"
      description="Create an account from the public site so you can continue into fundraiser checkout and keep track of future orders."
      meta={
        <p className="text-sm text-muted-foreground">
          Already registered?{' '}
          <Link
            href={loginHref}
            className="font-medium text-primary transition-colors hover:text-primary-700"
          >
            Sign in instead
          </Link>
        </p>
      }
      cardWidthClassName="max-w-lg"
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
              title="Sign up with Google"
              subtitle="Create your account in one step and return to the public site."
            />
            <div className="relative py-2 text-center text-xs text-muted-foreground">
              <span className="relative z-10 bg-white px-2">or register with email</span>
              <span className="bg-border absolute top-1/2 right-0 left-0 z-0 h-px -translate-y-1/2" />
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
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
              name="firstName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>First name</FormLabel>
                  <FormControl>
                    <Input type="text" autoComplete="given-name" placeholder="Amina" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="lastName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Last name</FormLabel>
                  <FormControl>
                    <Input type="text" autoComplete="family-name" placeholder="Okoro" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <FormLabel>Password</FormLabel>
                    <span className="text-xs text-muted-foreground">At least 8 characters</span>
                  </div>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        className="pr-16"
                        placeholder="Create a strong password"
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
                  <FormDescription>
                    Include uppercase, lowercase, a number, and a symbol for a stronger account.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem className="md:col-span-2">
                  <div className="flex items-center justify-between gap-3">
                    <FormLabel>Confirm password</FormLabel>
                    <span className="text-xs text-muted-foreground">
                      Re-enter the same password
                    </span>
                  </div>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? 'text' : 'password'}
                        autoComplete="new-password"
                        className="pr-16"
                        placeholder="Confirm your password"
                        {...field}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword((current: boolean) => !current)}
                        className="absolute top-1/2 right-3 -translate-y-1/2 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                      >
                        {showConfirmPassword ? 'Hide' : 'Show'}
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
              {isSubmitting ? 'Creating account...' : 'Create account'}
            </Button>
            <p className="text-center text-xs leading-5 text-muted-foreground">
              Once your account is created here, you can keep using it across the public site and
              customer workspace.
            </p>
          </div>
        </form>
      </FormProvider>
    </AuthPageShell>
  );
}

export default function RegisterPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <RegisterPageContent />
    </Suspense>
  );
}
