'use client';

import {
  authApi,
  ApiError,
  getAdminGoogleSignInUrl,
  GOOGLE_SIGN_IN_ERROR_MESSAGES,
} from '@/lib/auth';
import { UserRole } from '@tamiym/types';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
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

const adminLoginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type AdminLoginValues = z.infer<typeof adminLoginSchema>;

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('error');
    if (code) {
      queueMicrotask(() =>
        setError(GOOGLE_SIGN_IN_ERROR_MESSAGES[code] ?? 'Sign-in failed. Please try again.')
      );
      window.history.replaceState(null, '', window.location.pathname);
    }
  }, []);

  const form = useForm<AdminLoginValues>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const { isSubmitting } = form.formState;

  const onSubmit = async (values: AdminLoginValues) => {
    setError(null);

    try {
      const response = await authApi.login(values);

      // Verify user is an admin
      if (response.user.role !== UserRole.ADMIN) {
        await authApi.logout();
        setError('Access denied. Admin privileges required.');
        return;
      }

      router.push('/admin');
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Login failed. Please try again.');
    }
  };

  return (
    <AuthPageShell
      eyebrow="Operations access"
      title="Admin sign in"
      description="Use your admin email and password, or sign in with an existing admin Google account."
      variant="dark"
      hero={
        <div className="max-w-xl space-y-6 text-white">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent">
              Tamiym Admin
            </p>
            <h1 className="text-5xl font-semibold tracking-[-0.04em] text-white">
              Operations console access
            </h1>
          </div>
          <p className="max-w-lg text-base leading-7 text-white/72">
            Sign in with your admin account to manage orders, campaigns, payouts, pricing, and other
            operational workflows in one place.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-white">Queue-driven workflows</p>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Review orders, campaign approvals, payout runs, and other active operations.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-sm font-semibold text-white">Role-protected access</p>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Only verified admin accounts can enter the console and keep the session active.
              </p>
            </div>
          </div>
        </div>
      }
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
              href={getAdminGoogleSignInUrl('/admin')}
              title="Sign in with Google"
              subtitle="Only existing admin accounts can use Google sign-in."
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
                      placeholder="admin@tamiym.com"
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
                    <span className="text-xs text-muted-foreground">Admin credentials only</span>
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
                        onClick={() => setShowPassword((current) => !current)}
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
              Access is limited to admin accounts. Non-admin users are signed back out
              automatically.
            </p>
          </div>
        </form>
      </FormProvider>
    </AuthPageShell>
  );
}
