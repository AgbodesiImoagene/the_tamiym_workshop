'use client';

import { AdminShell } from '@/components/admin-shell';
import {
  getAdminSiteSettings,
  updateAdminSiteSettings,
  type UpdateSiteSettingsInput,
} from '@/lib/dashboard';
import {
  defaultSiteSettingsForm,
  siteSettingsFormSchema,
  toSiteSettingsForm,
  type SiteSettingsFormValues,
} from '@/lib/site-settings-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CurrencyCode, PayoutMode } from '@tamiym/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
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
import { useEffect } from 'react';
import { Controller, useForm } from 'react-hook-form';

export default function AdminSiteSettingsPage() {
  const queryClient = useQueryClient();
  const {
    control,
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<SiteSettingsFormValues, unknown, UpdateSiteSettingsInput>({
    resolver: zodResolver(siteSettingsFormSchema),
    defaultValues: defaultSiteSettingsForm,
  });

  const settingsQuery = useQuery({
    queryKey: ['admin-site-settings'],
    queryFn: getAdminSiteSettings,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      reset(toSiteSettingsForm(settingsQuery.data));
    }
  }, [settingsQuery.data, reset]);

  const vatRateNotConfigured = settingsQuery.data != null && settingsQuery.data.vatRate == null;

  const saveMutation = useMutation({
    mutationFn: updateAdminSiteSettings,
    onSuccess: async (updated) => {
      queryClient.setQueryData(['admin-site-settings'], updated);
      await queryClient.invalidateQueries({ queryKey: ['admin-site-settings'] });
    },
  });

  const vatRateError = errors.vatRatePercent?.message;
  const message = saveMutation.isSuccess ? 'Site settings saved.' : null;
  const error =
    vatRateError ??
    (saveMutation.isError
      ? saveMutation.error.message || 'We could not save site settings.'
      : null);

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
                  step="0.01"
                  required
                  aria-invalid={vatRateError ? true : undefined}
                  aria-describedby={
                    [
                      vatRateNotConfigured ? 'vatRateNotConfigured' : null,
                      vatRateError ? 'siteSettingsError' : null,
                    ]
                      .filter(Boolean)
                      .join(' ') || undefined
                  }
                  {...register('vatRatePercent')}
                />
                {vatRateNotConfigured ? (
                  <p id="vatRateNotConfigured" role="alert" className="text-sm text-destructive">
                    No VAT rate is set. Checkout is paused until you enter one and save.
                  </p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Controller
                  control={control}
                  name="currency"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(val) => field.onChange(val as CurrencyCode)}
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
                  )}
                />
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-black/8 bg-[#f7f9fc] p-4">
                <Controller
                  control={control}
                  name="pricesIncludeVat"
                  render={({ field }) => (
                    <Checkbox
                      className="mt-1"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                  )}
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-black">Prices include VAT</p>
                  <p className="text-xs leading-5 text-black/60">
                    Enable this if merchandising prices should already be VAT-inclusive.
                  </p>
                </div>
              </label>

              <label className="flex items-start gap-3 rounded-2xl border border-black/8 bg-[#f7f9fc] p-4">
                <Controller
                  control={control}
                  name="vatAppliesToShipping"
                  render={({ field }) => (
                    <Checkbox
                      className="mt-1"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                  )}
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
                <Controller
                  control={control}
                  name="payoutMode"
                  render={({ field }) => (
                    <Select
                      value={field.value}
                      onValueChange={(val) => field.onChange(val as PayoutMode)}
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
                  )}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="minimumPayoutAmount">Minimum payout amount</Label>
                <Input
                  id="minimumPayoutAmount"
                  type="number"
                  min="0"
                  step="0.01"
                  {...register('minimumPayoutAmount')}
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
                  {...register('payoutCadenceDays')}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="payoutSettlementHoldDays">Settlement hold (days)</Label>
                <Input
                  id="payoutSettlementHoldDays"
                  type="number"
                  min="0"
                  max="365"
                  {...register('payoutSettlementHoldDays')}
                />
              </div>

              <label className="md:col-span-2 flex items-start gap-3 rounded-2xl border border-black/8 bg-[#f7f9fc] p-4">
                <Controller
                  control={control}
                  name="autoRetryFailedPayouts"
                  render={({ field }) => (
                    <Checkbox
                      className="mt-1"
                      checked={field.value}
                      onCheckedChange={(checked) => field.onChange(checked === true)}
                    />
                  )}
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
                        saveMutation.reset();
                        void handleSubmit((payload) => saveMutation.mutate(payload))();
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
                          reset(toSiteSettingsForm(settingsQuery.data));
                        }
                        // Clear the last outcome, but never detach an in-flight save:
                        // its result must still show once it lands.
                        if (!saveMutation.isPending) saveMutation.reset();
                      }}
                      disabled={!isDirty}
                    >
                      Reset unsaved changes
                    </Button>
                  </div>
                  {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
                  {error ? (
                    <p id="siteSettingsError" role="alert" className="text-sm text-red-700">
                      {error}
                    </p>
                  ) : null}
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
