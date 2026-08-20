'use client';

import {
  authApi,
  ApiError,
  getAdminGoogleSignInUrl,
  GOOGLE_SIGN_IN_ERROR_MESSAGES,
  type AdminMfaEnrollmentStart,
  type AdminMfaStatus,
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

const totpSchema = z.object({
  totp: z
    .string()
    .trim()
    .regex(/^\d{6}$/, 'Enter the 6-digit authenticator code'),
});

const recoverySchema = z.object({
  recovery_code: z.string().trim().min(8, 'Enter a recovery code'),
});

type AdminLoginValues = z.infer<typeof adminLoginSchema>;
type TotpValues = z.infer<typeof totpSchema>;
type RecoveryValues = z.infer<typeof recoverySchema>;

type LoginStep = 'password' | 'enroll' | 'challenge';

export default function AdminLoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [step, setStep] = useState<LoginStep>('password');
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaStatus, setMfaStatus] = useState<AdminMfaStatus | null>(null);
  const [enrollment, setEnrollment] = useState<AdminMfaEnrollmentStart | null>(null);
  const [useRecovery, setUseRecovery] = useState(false);
  const [busy, setBusy] = useState(false);

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

  const passwordForm = useForm<AdminLoginValues>({
    resolver: zodResolver(adminLoginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const totpForm = useForm<TotpValues>({
    resolver: zodResolver(totpSchema),
    defaultValues: { totp: '' },
  });

  const recoveryForm = useForm<RecoveryValues>({
    resolver: zodResolver(recoverySchema),
    defaultValues: { recovery_code: '' },
  });

  const finishSession = async (response: { user: { role: UserRole } }) => {
    if (response.user.role !== UserRole.ADMIN) {
      await authApi.logout();
      setError('Access denied. Admin privileges required.');
      setStep('password');
      setMfaToken(null);
      setEnrollment(null);
      return;
    }
    router.push('/admin');
  };

  const onPasswordSubmit = async (values: AdminLoginValues) => {
    setError(null);
    setBusy(true);
    try {
      const challenge = await authApi.login(values);
      setMfaToken(challenge.mfa_token);
      setMfaStatus(challenge.mfa.status);
      totpForm.reset({ totp: '' });
      recoveryForm.reset({ recovery_code: '' });
      setUseRecovery(false);

      if (challenge.mfa.status === 'ENROLLMENT_REQUIRED') {
        const started = await authApi.mfaEnrollStart(challenge.mfa_token);
        setEnrollment(started);
        setStep('enroll');
      } else {
        setEnrollment(null);
        setStep('challenge');
      }
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Login failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onTotpSubmit = async (values: TotpValues) => {
    if (!mfaToken || !mfaStatus) return;
    setError(null);
    setBusy(true);
    try {
      const response =
        mfaStatus === 'ENROLLMENT_REQUIRED'
          ? await authApi.mfaEnrollConfirm(mfaToken, values.totp)
          : await authApi.mfaChallenge(mfaToken, values.totp);
      await finishSession(response);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Authenticator code rejected. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const onRecoverySubmit = async (values: RecoveryValues) => {
    if (!mfaToken) return;
    setError(null);
    setBusy(true);
    try {
      const response = await authApi.mfaRecover(mfaToken, values.recovery_code);
      await finishSession(response);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Recovery code rejected. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const resetToPassword = () => {
    setStep('password');
    setMfaToken(null);
    setMfaStatus(null);
    setEnrollment(null);
    setUseRecovery(false);
    setError(null);
    totpForm.reset({ totp: '' });
    recoveryForm.reset({ recovery_code: '' });
  };

  const title =
    step === 'password'
      ? 'Admin sign in'
      : step === 'enroll'
        ? 'Set up authenticator'
        : 'Two-factor authentication';

  const description =
    step === 'password'
      ? 'Use your admin email and password, or sign in with an existing admin Google account.'
      : step === 'enroll'
        ? 'Scan the QR URI in your authenticator app, save your recovery codes, then enter a code to finish.'
        : 'Enter the 6-digit code from your authenticator app, or use a recovery code.';

  return (
    <AuthPageShell
      eyebrow="Operations access"
      title={title}
      description={description}
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
              <p className="text-sm font-semibold text-white">MFA-protected access</p>
              <p className="mt-2 text-sm leading-6 text-white/65">
                Admin sessions require a verified authenticator (or recovery code) after password.
              </p>
            </div>
          </div>
        </div>
      }
    >
      {error ? (
        <div
          role="alert"
          aria-live="assertive"
          className="mb-6 rounded-2xl border border-red-200 bg-red-50 p-4"
        >
          <p className="text-sm text-red-700">{error}</p>
        </div>
      ) : null}

      {step === 'password' ? (
        <FormProvider {...passwordForm}>
          <form className="space-y-6" onSubmit={passwordForm.handleSubmit(onPasswordSubmit)}>
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
                control={passwordForm.control}
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
                control={passwordForm.control}
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
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? 'Checking...' : 'Continue'}
              </Button>
              <p className="text-center text-xs leading-5 text-muted-foreground">
                Access is limited to admin accounts. MFA is required before a console session
                starts.
              </p>
            </div>
          </form>
        </FormProvider>
      ) : null}

      {step === 'enroll' && enrollment ? (
        <div className="space-y-6">
          <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4">
            <p className="text-sm font-medium text-foreground">Authenticator setup</p>
            <p className="text-xs leading-5 text-muted-foreground break-all">
              {enrollment.otpauth_uri}
            </p>
            <p className="text-xs text-muted-foreground">
              Manual secret: <span className="font-mono text-foreground">{enrollment.secret}</span>
            </p>
          </div>
          <div className="space-y-2 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-sm font-medium text-amber-950">Recovery codes (save now)</p>
            <ul className="grid gap-1 font-mono text-xs text-amber-950 sm:grid-cols-2">
              {enrollment.recovery_codes.map((code) => (
                <li key={code}>{code}</li>
              ))}
            </ul>
          </div>
          <FormProvider {...totpForm}>
            <form className="space-y-4" onSubmit={totpForm.handleSubmit(onTotpSubmit)}>
              <FormField
                control={totpForm.control}
                name="totp"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Authenticator code</FormLabel>
                    <FormControl>
                      <Input
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        placeholder="123456"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? 'Confirming...' : 'Enable MFA and sign in'}
              </Button>
            </form>
          </FormProvider>
          <button
            type="button"
            onClick={resetToPassword}
            className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
          >
            Back to password
          </button>
        </div>
      ) : null}

      {step === 'challenge' ? (
        <div className="space-y-6">
          {!useRecovery ? (
            <FormProvider {...totpForm}>
              <form className="space-y-4" onSubmit={totpForm.handleSubmit(onTotpSubmit)}>
                <FormField
                  control={totpForm.control}
                  name="totp"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Authenticator code</FormLabel>
                      <FormControl>
                        <Input
                          inputMode="numeric"
                          autoComplete="one-time-code"
                          placeholder="123456"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? 'Verifying...' : 'Verify and sign in'}
                </Button>
              </form>
            </FormProvider>
          ) : (
            <FormProvider {...recoveryForm}>
              <form className="space-y-4" onSubmit={recoveryForm.handleSubmit(onRecoverySubmit)}>
                <FormField
                  control={recoveryForm.control}
                  name="recovery_code"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Recovery code</FormLabel>
                      <FormControl>
                        <Input autoComplete="off" placeholder="XXXX-XXXX-..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" disabled={busy} className="w-full">
                  {busy ? 'Verifying...' : 'Use recovery code'}
                </Button>
              </form>
            </FormProvider>
          )}
          <div className="flex flex-col gap-2 text-center text-xs">
            <button
              type="button"
              onClick={() => {
                setUseRecovery((current) => !current);
                setError(null);
              }}
              className="text-muted-foreground hover:text-foreground"
            >
              {useRecovery ? 'Use authenticator code instead' : 'Use a recovery code instead'}
            </button>
            <button
              type="button"
              onClick={resetToPassword}
              className="text-muted-foreground hover:text-foreground"
            >
              Back to password
            </button>
          </div>
        </div>
      ) : null}
    </AuthPageShell>
  );
}
