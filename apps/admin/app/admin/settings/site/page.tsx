'use client';

/* eslint-disable react-hooks/set-state-in-effect -- Loaded settings intentionally initialize the local edit form. */

import { AdminShell } from '@/components/admin-shell';
import { getAdminSiteSettings, updateAdminSiteSettings, type SiteSettings } from '@/lib/dashboard';
import { CurrencyCode, PayoutMode } from '@tamiym/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from '@tamiym/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

type SiteSettingsForm = {
  vatRatePercent: string;
  pricesIncludeVat: boolean;
  vatAppliesToShipping: boolean;
  currency: CurrencyCode;
  payoutMode: PayoutMode;
  payoutCadenceDays: string;
  payoutSettlementHoldDays: string;
  minimumPayoutAmount: string;
  autoRetryFailedPayouts: boolean;
};

const defaultForm: SiteSettingsForm = {
  vatRatePercent: '0',
  pricesIncludeVat: true,
  vatAppliesToShipping: true,
  currency: CurrencyCode.NGN,
  payoutMode: PayoutMode.MANUAL,
  payoutCadenceDays: '7',
  payoutSettlementHoldDays: '7',
  minimumPayoutAmount: '',
  autoRetryFailedPayouts: true,
};

function toFormState(settings: SiteSettings): SiteSettingsForm {
  return {
    vatRatePercent: String(Number(settings.vatRate) * 100),
    pricesIncludeVat: settings.pricesIncludeVat,
    vatAppliesToShipping: settings.vatAppliesToShipping,
    currency: settings.currency as CurrencyCode,
    payoutMode: settings.payoutMode as PayoutMode,
    payoutCadenceDays: String(settings.payoutCadenceDays),
    payoutSettlementHoldDays: String(settings.payoutSettlementHoldDays),
    minimumPayoutAmount:
      settings.minimumPayoutAmount != null ? String(settings.minimumPayoutAmount) : '',
    autoRetryFailedPayouts: settings.autoRetryFailedPayouts,
  };
}

export default function AdminSiteSettingsPage() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState<SiteSettingsForm>(defaultForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const settingsQuery = useQuery({
    queryKey: ['admin-site-settings'],
    queryFn: getAdminSiteSettings,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      setForm(toFormState(settingsQuery.data));
    }
  }, [settingsQuery.data]);

  const normalizedInitial = useMemo(
    () => (settingsQuery.data ? JSON.stringify(toFormState(settingsQuery.data)) : null),
    [settingsQuery.data]
  );
  const normalizedCurrent = JSON.stringify(form);
  const isDirty = normalizedInitial != null && normalizedInitial !== normalizedCurrent;

  const saveMutation = useMutation({
    mutationFn: async () => {
      const minimumPayoutAmount =
        form.minimumPayoutAmount.trim() === '' ? null : Number(form.minimumPayoutAmount);

      return updateAdminSiteSettings({
        vatRate: Number(form.vatRatePercent) / 100,
        pricesIncludeVat: form.pricesIncludeVat,
        vatAppliesToShipping: form.vatAppliesToShipping,
        currency: form.currency,
        payoutMode: form.payoutMode,
        payoutCadenceDays: Number(form.payoutCadenceDays),
        payoutSettlementHoldDays: Number(form.payoutSettlementHoldDays),
        minimumPayoutAmount,
        autoRetryFailedPayouts: form.autoRetryFailedPayouts,
      });
    },
    onSuccess: async (updated) => {
      queryClient.setQueryData(['admin-site-settings'], updated);
      await queryClient.invalidateQueries({ queryKey: ['admin-site-settings'] });
      setMessage('Site settings saved.');
      setError(null);
    },
    onError: (mutationError: { message?: string }) => {
      setError(mutationError.message || 'We could not save site settings.');
      setMessage(null);
    },
  });

  function updateField<K extends keyof SiteSettingsForm>(key: K, value: SiteSettingsForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  return (
    <AdminShell
      activeNav="settings"
      title="Site settings"
      description="Control VAT defaults and platform-wide payout policy from one admin workspace."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-6">
          <Card className="rounded-[1.75rem] border-black/8 shadow-none">
            <CardHeader>
              <CardTitle>Pricing defaults</CardTitle>
              <CardDescription>
                Set how VAT is represented throughout the storefront and checkout.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="vatRatePercent">VAT rate (%)</Label>
                <Input
                  id="vatRatePercent"
                  type="number"
                  min="0"
                  max="100"
                  step="0.1"
                  value={form.vatRatePercent}
                  onChange={(event) => updateField('vatRatePercent', event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={form.currency}
                  onValueChange={(val) => updateField('currency', val as CurrencyCode)}
                >
                  <SelectTrigger id="currency" className="h-11 w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(CurrencyCode).map((currency) => (
                      <SelectItem key={currency} value={currency}>
                        {currency}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-black/8 bg-[#f7f9fc] p-4">
                <Checkbox
                  className="mt-1"
                  checked={form.pricesIncludeVat}
                  onCheckedChange={(checked) => updateField('pricesIncludeVat', checked as boolean)}
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-black">Prices include VAT</p>
                  <p className="text-xs leading-5 text-black/60">
                    Enable this if merchandising prices should already be VAT-inclusive.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-black/8 bg-[#f7f9fc] p-4">
                <Checkbox
                  className="mt-1"
                  checked={form.vatAppliesToShipping}
                  onCheckedChange={(checked) =>
                    updateField('vatAppliesToShipping', checked as boolean)
                  }
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-black">VAT applies to shipping</p>
                  <p className="text-xs leading-5 text-black/60">
                    Keep enabled if delivery fees should inherit the same VAT treatment.
                  </p>
                </div>
              </label>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-black/8 shadow-none">
            <CardHeader>
              <CardTitle>Payout defaults</CardTitle>
              <CardDescription>
                Set the platform default used for fundraiser payout scheduling and retry policy.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="payoutMode">Default payout mode</Label>
                <Select
                  value={form.payoutMode}
                  onValueChange={(val) => updateField('payoutMode', val as PayoutMode)}
                >
                  <SelectTrigger id="payoutMode" className="h-11 w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(PayoutMode).map((mode) => (
                      <SelectItem key={mode} value={mode}>
                        {mode.replaceAll('_', ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="minimumPayoutAmount">Minimum payout amount</Label>
                <Input
                  id="minimumPayoutAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.minimumPayoutAmount}
                  onChange={(event) => updateField('minimumPayoutAmount', event.target.value)}
                  placeholder="Leave blank for no minimum"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payoutCadenceDays">Payout cadence (days)</Label>
                <Input
                  id="payoutCadenceDays"
                  type="number"
                  min="1"
                  max="90"
                  value={form.payoutCadenceDays}
                  onChange={(event) => updateField('payoutCadenceDays', event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payoutSettlementHoldDays">Settlement hold (days)</Label>
                <Input
                  id="payoutSettlementHoldDays"
                  type="number"
                  min="0"
                  max="365"
                  value={form.payoutSettlementHoldDays}
                  onChange={(event) => updateField('payoutSettlementHoldDays', event.target.value)}
                />
              </div>

              <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-black/8 bg-[#f7f9fc] p-4">
                <Checkbox
                  className="mt-1"
                  checked={form.autoRetryFailedPayouts}
                  onCheckedChange={(checked) =>
                    updateField('autoRetryFailedPayouts', checked as boolean)
                  }
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-black">
                    Automatically retry failed payouts
                  </p>
                  <p className="text-xs leading-5 text-black/60">
                    Use this to keep transient Paystack transfer failures in the automated recovery
                    path.
                  </p>
                </div>
              </label>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-[1.75rem] border-black/8 shadow-none">
            <CardHeader>
              <CardTitle>Save changes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {settingsQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-11 w-full rounded-xl" />
                  ))}
                </div>
              ) : settingsQuery.isError ? (
                <p className="text-sm text-red-700">We could not load current site settings.</p>
              ) : (
                <>
                  <p className="text-sm leading-6 text-black/65">
                    These defaults feed the payout and checkout flows used elsewhere in admin.
                  </p>
                  <div className="flex flex-col gap-3">
                    <Button
                      className="w-full"
                      onClick={() => {
                        setMessage(null);
                        setError(null);
                        saveMutation.mutate();
                      }}
                      disabled={saveMutation.isPending || !isDirty}
                    >
                      {saveMutation.isPending ? 'Saving...' : 'Save site settings'}
                    </Button>
                    <Button
                      variant="ghost"
                      className="w-full"
                      onClick={() => {
                        if (settingsQuery.data) {
                          setForm(toFormState(settingsQuery.data));
                        }
                        setMessage(null);
                        setError(null);
                      }}
                      disabled={!isDirty}
                    >
                      Reset unsaved changes
                    </Button>
                  </div>
                  {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
                  {error ? <p className="text-sm text-red-700">{error}</p> : null}
                </>
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-black/8 shadow-none">
            <CardHeader>
              <CardTitle>Operational notes</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-black/65">
              <p>
                Changing payout mode here only updates the platform default. Campaign-level
                overrides still win.
              </p>
              <p>
                VAT and minimum payout changes affect future workflows; they do not retroactively
                rewrite historical records.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
