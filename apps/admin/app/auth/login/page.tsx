'use client';

import { authApi, ApiError } from '@/lib/auth';
import { UserRole } from '@tamiym/types';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@tamiym/ui';

const adminLoginSchema = z.object({
  email: z.email('Enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

type AdminLoginValues = z.infer<typeof adminLoginSchema>;

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AdminLoginValues>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

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
    <div className="flex min-h-screen items-center justify-center bg-linear-to-b from-primary-950 via-primary to-primary-50 px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-primary">
            Operations access
          </p>
          <CardTitle>Admin sign in</CardTitle>
          <p className="text-sm text-muted-foreground">Sign in to access the admin dashboard</p>
        </CardHeader>

        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit(onSubmit)}>
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}

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
