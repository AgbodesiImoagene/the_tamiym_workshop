'use client';

import { CustomerDashboardShell, formatCurrency } from '@/components/customer-dashboard-shell';
import { authApi, ApiError, User } from '@/lib/auth';
import { getCustomerCampaigns } from '@/lib/dashboard';
import { createPayoutProfile, getBanks, getPayoutProfiles } from '@/lib/fundraising';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';

interface PayoutFormValues {
  label: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
}

export default function DashboardFundraiserPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);

  const payoutForm = useForm<PayoutFormValues>({
    defaultValues: {
      label: '',
      bankCode: '',
      accountNumber: '',
      accountName: '',
    },
  });

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const userData = await authApi.getMe();
        setUser(userData);
      } catch (err) {
        const apiError = err as ApiError;
        if (apiError.statusCode === 401) {
          router.push('/auth/login');
        } else {
          setError(apiError.message || 'Failed to load user data');
        }
      }
    };

    void fetchUser();
  }, [router]);

  const campaignsQuery = useQuery({
    queryKey: ['customer-campaigns-fundraiser'],
    queryFn: getCustomerCampaigns,
    enabled: !!user,
  });

  const banksQuery = useQuery({
    queryKey: ['fundraiser-banks'],
    queryFn: getBanks,
    enabled: !!user,
    retry: false,
  });

  const payoutProfilesQuery = useQuery({
    queryKey: ['fundraiser-payout-profiles'],
    queryFn: getPayoutProfiles,
    enabled: !!user,
    retry: false,
  });

  const payoutMutation = useMutation({
    mutationFn: createPayoutProfile,
    onSuccess: async () => {
      setSubmitMessage('Payout profile saved.');
      payoutForm.reset();
      await queryClient.invalidateQueries({ queryKey: ['fundraiser-payout-profiles'] });
    },
    onError: (mutationError) => {
      const apiError = mutationError as ApiError;
      setSubmitMessage(apiError.message || 'Could not save payout profile.');
    },
  });

  const totalRaised = useMemo(
    () =>
      (campaignsQuery.data ?? []).reduce((sum, campaign) => sum + (campaign.currentAmount ?? 0), 0),
    [campaignsQuery.data]
  );

  const organizerLocked =
    (banksQuery.error as ApiError | null)?.statusCode === 403 ||
    (payoutProfilesQuery.error as ApiError | null)?.statusCode === 403;

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <CustomerDashboardShell
      activeNav="fundraiser"
      displayName={user?.firstName || user?.email?.split('@')[0] || 'Borngreat'}
    >
      <div className="mt-10 space-y-10 lg:mt-0">
        <div className="space-y-3">
          <h1 className="text-[32px] font-bold tracking-[-0.02em] text-black/90">Fundraiser</h1>
          <p className="max-w-2xl text-base text-black/75">
            Monitor campaign performance and keep your payout destination ready for future
            disbursements.
          </p>
        </div>

        <section className="grid gap-6 md:grid-cols-3">
          <div className="rounded-[28px] border border-black/15 bg-white p-6 shadow-[0_4px_4px_rgba(0,0,0,0.12)]">
            <p className="text-sm text-black/60">Active campaigns</p>
            <p className="mt-3 text-[30px] font-bold text-black">
              {campaignsQuery.data?.length ?? 0}
            </p>
          </div>
          <div className="rounded-[28px] border border-black/15 bg-white p-6 shadow-[0_4px_4px_rgba(0,0,0,0.12)]">
            <p className="text-sm text-black/60">Funds raised</p>
            <p className="mt-3 text-[30px] font-bold text-black">
              {formatCurrency(totalRaised, campaignsQuery.data?.[0]?.currency ?? 'NGN')}
            </p>
          </div>
          <div className="rounded-[28px] border border-black/15 bg-white p-6 shadow-[0_4px_4px_rgba(0,0,0,0.12)]">
            <p className="text-sm text-black/60">Payout profiles</p>
            <p className="mt-3 text-[30px] font-bold text-black">
              {payoutProfilesQuery.data?.length ?? 0}
            </p>
          </div>
        </section>

        <section className="grid gap-8 xl:grid-cols-[1.05fr_0.95fr]">
          <div className="rounded-[32px] border border-black/20 bg-white p-6 shadow-[0_4px_4px_rgba(0,0,0,0.15)]">
            <h2 className="text-[24px] font-bold text-black/90">Campaign Overview</h2>
            <div className="mt-6 space-y-4">
              {campaignsQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading campaigns...</p>
              ) : campaignsQuery.isError ? (
                <p className="text-sm text-red-700">We could not load your campaigns.</p>
              ) : campaignsQuery.data?.length ? (
                campaignsQuery.data.map((campaign) => {
                  const raised = campaign.currentAmount ?? 0;
                  const goal = campaign.goalAmount ?? 0;
                  const progress = goal > 0 ? Math.min((raised / goal) * 100, 100) : 0;

                  return (
                    <article
                      key={campaign.id}
                      className="rounded-[24px] border border-black/10 px-5 py-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-lg font-bold text-black">{campaign.title}</p>
                          <p className="text-sm text-black/60">
                            {campaign.status.replaceAll('_', ' ')}
                          </p>
                        </div>
                        <span className="rounded-full bg-[#cfddf8] px-3 py-1 text-xs font-medium text-[#004385]">
                          {campaign.slug}
                        </span>
                      </div>
                      <div className="mt-4 h-3 rounded-full bg-black/10">
                        <div
                          className="h-3 rounded-full bg-[#00cb2f]"
                          style={{ width: `${progress}%` }}
                        />
                      </div>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm text-black/70">
                        <span>{formatCurrency(raised, campaign.currency)} raised</span>
                        <span>
                          Goal: {goal > 0 ? formatCurrency(goal, campaign.currency) : 'Flexible'}
                        </span>
                      </div>
                    </article>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">
                  No campaigns yet. Create a fundraiser from your organizer flow when you are ready.
                </p>
              )}
            </div>
          </div>

          <div className="space-y-8">
            <section className="rounded-[32px] border border-black/20 bg-white p-6 shadow-[0_4px_4px_rgba(0,0,0,0.15)]">
              <h2 className="text-[24px] font-bold text-black/90">Payout Setup</h2>
              <p className="mt-2 text-sm text-black/65">
                Add the bank account that should receive campaign payouts.
              </p>

              {organizerLocked ? (
                <p className="mt-5 rounded-2xl bg-[#fff4d6] px-4 py-4 text-sm text-[#7a5a00]">
                  Organizer access is required before payout details can be managed on this account.
                </p>
              ) : (
                <form
                  className="mt-6 space-y-4"
                  onSubmit={payoutForm.handleSubmit(async (values) => {
                    setSubmitMessage(null);
                    const bank = banksQuery.data?.find((item) => item.code === values.bankCode);
                    await payoutMutation.mutateAsync({
                      label: values.label || undefined,
                      bankCode: values.bankCode,
                      bankName: bank?.name,
                      accountNumber: values.accountNumber,
                      accountName: values.accountName,
                    });
                  })}
                >
                  <input
                    className="h-12 w-full rounded-xl border border-black/20 px-4 text-sm outline-none"
                    placeholder="Profile label"
                    {...payoutForm.register('label')}
                  />
                  <select
                    className="h-12 w-full rounded-xl border border-black/20 px-4 text-sm outline-none"
                    {...payoutForm.register('bankCode', { required: true })}
                  >
                    <option value="">Select bank</option>
                    {(banksQuery.data ?? []).map((bank) => (
                      <option key={bank.code} value={bank.code}>
                        {bank.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="h-12 w-full rounded-xl border border-black/20 px-4 text-sm outline-none"
                    placeholder="Account number"
                    {...payoutForm.register('accountNumber', { required: true })}
                  />
                  <input
                    className="h-12 w-full rounded-xl border border-black/20 px-4 text-sm outline-none"
                    placeholder="Account name"
                    {...payoutForm.register('accountName', { required: true })}
                  />
                  <button
                    type="submit"
                    disabled={payoutMutation.isPending}
                    className="h-10 rounded-lg border border-black/50 bg-accent px-5 text-sm font-bold text-[#004385] disabled:opacity-60"
                  >
                    {payoutMutation.isPending ? 'Saving...' : 'Save payout profile'}
                  </button>
                  {submitMessage ? <p className="text-sm text-black/70">{submitMessage}</p> : null}
                </form>
              )}
            </section>

            <section className="rounded-[32px] border border-black/20 bg-white p-6 shadow-[0_4px_4px_rgba(0,0,0,0.15)]">
              <h2 className="text-[24px] font-bold text-black/90">Saved Payout Profiles</h2>
              <div className="mt-6 space-y-3">
                {payoutProfilesQuery.isLoading ? (
                  <p className="text-sm text-muted-foreground">Loading payout profiles...</p>
                ) : payoutProfilesQuery.data?.length ? (
                  payoutProfilesQuery.data.map((profile) => (
                    <div key={profile.id} className="rounded-2xl border border-black/10 px-4 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="font-semibold text-black">
                            {profile.label || profile.bankName || 'Bank account'}
                          </p>
                          <p className="text-sm text-black/60">
                            {profile.accountName} · {profile.accountNumber}
                          </p>
                        </div>
                        {profile.isDefault ? (
                          <span className="rounded-full bg-[#cfddf8] px-3 py-1 text-xs font-medium text-[#004385]">
                            Default
                          </span>
                        ) : null}
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No payout profiles saved yet.</p>
                )}
              </div>
            </section>
          </div>
        </section>
      </div>
    </CustomerDashboardShell>
  );
}
