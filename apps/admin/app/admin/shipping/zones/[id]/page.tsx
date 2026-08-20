'use client';

/* eslint-disable react-hooks/set-state-in-effect -- Loaded zone data intentionally initializes the local edit form. */

import { AdminShell, formatAdminCurrency, formatAdminDate } from '@/components/admin-shell';
import {
  createAdminShippingRate,
  createAdminShippingZoneArea,
  getAdminGeoLgas,
  getAdminGeoStates,
  getAdminShippingZone,
  updateAdminShippingZone,
} from '@/lib/shipping';
import { CurrencyCode, ShippingRateProvider } from '@tamiym/types';
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
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';

type ZoneFormState = {
  name: string;
  isActive: boolean;
};

export default function AdminShippingZoneDetailPage() {
  const params = useParams<{ id: string }>();
  const zoneId = params.id;
  const queryClient = useQueryClient();
  const [zoneForm, setZoneForm] = useState<ZoneFormState>({ name: '', isActive: true });
  const [stateCode, setStateCode] = useState('');
  const [lgaId, setLgaId] = useState('');
  const [serviceLevel, setServiceLevel] = useState('STANDARD');
  const [flatFee, setFlatFee] = useState('');
  const [priority, setPriority] = useState('100');
  const [minDeliveryDays, setMinDeliveryDays] = useState('');
  const [maxDeliveryDays, setMaxDeliveryDays] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const zoneQuery = useQuery({
    queryKey: ['admin-shipping-zone', zoneId],
    queryFn: () => getAdminShippingZone(zoneId),
  });
  const statesQuery = useQuery({
    queryKey: ['admin-geo-states'],
    queryFn: getAdminGeoStates,
  });
  const lgasQuery = useQuery({
    queryKey: ['admin-geo-lgas', stateCode],
    queryFn: () => getAdminGeoLgas(stateCode),
    enabled: Boolean(stateCode),
  });

  useEffect(() => {
    if (zoneQuery.data) {
      setZoneForm({
        name: zoneQuery.data.name,
        isActive: zoneQuery.data.isActive,
      });
    }
  }, [zoneQuery.data]);

  const updateZoneMutation = useMutation({
    mutationFn: () =>
      updateAdminShippingZone(zoneId, {
        name: zoneForm.name.trim(),
        isActive: zoneForm.isActive,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-shipping-zone', zoneId] });
      await queryClient.invalidateQueries({ queryKey: ['admin-shipping-zones'] });
      setMessage('Zone details updated.');
      setError(null);
    },
    onError: (mutationError: { message?: string }) => {
      setError(mutationError.message || 'We could not update this zone.');
      setMessage(null);
    },
  });

  const addAreaMutation = useMutation({
    mutationFn: () =>
      createAdminShippingZoneArea(zoneId, {
        stateCode,
        lgaId: lgaId || null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-shipping-zone', zoneId] });
      setMessage('Zone area added.');
      setError(null);
      setLgaId('');
    },
    onError: (mutationError: { message?: string }) => {
      setError(mutationError.message || 'We could not add the zone area.');
      setMessage(null);
    },
  });

  const addRateMutation = useMutation({
    mutationFn: () =>
      createAdminShippingRate(zoneId, {
        provider: ShippingRateProvider.INTERNAL,
        serviceLevel: serviceLevel.trim() || 'STANDARD',
        currency: CurrencyCode.NGN,
        flatFee: Number(flatFee),
        priority: Number(priority),
        minDeliveryDays: minDeliveryDays ? Number(minDeliveryDays) : null,
        maxDeliveryDays: maxDeliveryDays ? Number(maxDeliveryDays) : null,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-shipping-zone', zoneId] });
      setMessage('Shipping rate added.');
      setError(null);
      setServiceLevel('STANDARD');
      setFlatFee('');
      setPriority('100');
      setMinDeliveryDays('');
      setMaxDeliveryDays('');
    },
    onError: (mutationError: { message?: string }) => {
      setError(mutationError.message || 'We could not add the shipping rate.');
      setMessage(null);
    },
  });

  return (
    <AdminShell
      activeNav="shipping"
      title="Shipping zone detail"
      description="Manage one zone’s activation, geographic coverage, and active delivery rates."
    >
      {zoneQuery.isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-2xl" />
          ))}
        </div>
      ) : zoneQuery.isError || !zoneQuery.data ? (
        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardContent className="p-8 text-sm text-red-700">
            We could not load this shipping zone.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Zone summary</CardTitle>
                <CardDescription>
                  Review the zone profile before changing delivery coverage or rate cards.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Zone name
                  </p>
                  <p className="mt-2 text-lg font-semibold text-tamiym-blue">
                    {zoneQuery.data.name}
                  </p>
                  <p className="mt-2 text-xs text-black/55">
                    Updated {formatAdminDate(zoneQuery.data.updatedAt)}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Coverage
                  </p>
                  <p className="mt-2 text-sm text-black/70">
                    {zoneQuery.data.areas.length} area(s), {zoneQuery.data.rules.length} rule(s),{' '}
                    {zoneQuery.data.rates.length} rate(s)
                  </p>
                  <p className="mt-2 text-xs text-black/55">
                    {zoneQuery.data.isActive ? 'Active for resolution' : 'Inactive'}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Coverage areas</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {zoneQuery.data.areas.length ? (
                  zoneQuery.data.areas.map((area) => (
                    <div
                      key={area.id}
                      className="rounded-2xl border border-black/8 bg-white px-4 py-3"
                    >
                      <p className="text-sm font-semibold text-tamiym-blue">
                        {area.state.name}
                        {area.lga ? ` · ${area.lga.name}` : ' · All LGAs'}
                      </p>
                      <p className="mt-1 text-xs text-black/55">State code: {area.stateCode}</p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-black/55">No areas mapped to this zone yet.</p>
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Rates</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {zoneQuery.data.rates.length ? (
                  zoneQuery.data.rates.map((rate) => (
                    <div
                      key={rate.id}
                      className="rounded-2xl border border-black/8 bg-white px-4 py-3"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-tamiym-blue">
                            {rate.serviceLevel}
                          </p>
                          <p className="mt-1 text-xs text-black/55">
                            Priority {rate.priority} · {rate.provider}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-black">
                          {formatAdminCurrency(Number(rate.flatFee), rate.currency)}
                        </p>
                      </div>
                      <p className="mt-2 text-xs text-black/55">
                        Delivery window:{' '}
                        {rate.minDeliveryDays != null || rate.maxDeliveryDays != null
                          ? `${rate.minDeliveryDays ?? '?'}-${rate.maxDeliveryDays ?? '?'} day(s)`
                          : 'Not specified'}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-black/55">No rates configured for this zone yet.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Edit zone</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="zoneName">Zone name</Label>
                  <Input
                    id="zoneName"
                    value={zoneForm.name}
                    onChange={(event) =>
                      setZoneForm((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </div>
                <label className="flex items-start gap-3 rounded-2xl border border-black/8 bg-[#f7f9fc] p-4">
                  <Checkbox
                    className="mt-1"
                    checked={zoneForm.isActive}
                    onCheckedChange={(checked) =>
                      setZoneForm((current) => ({ ...current, isActive: checked as boolean }))
                    }
                  />
                  <div className="space-y-1">
                    <p className="text-sm font-semibold text-black">Zone is active</p>
                    <p className="text-xs leading-5 text-black/60">
                      Disable the zone if it should stop participating in delivery matching.
                    </p>
                  </div>
                </label>
                <Button
                  className="w-full"
                  onClick={() => {
                    setMessage(null);
                    setError(null);
                    updateZoneMutation.mutate();
                  }}
                  disabled={updateZoneMutation.isPending || !zoneForm.name.trim()}
                >
                  {updateZoneMutation.isPending ? 'Saving...' : 'Save zone'}
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Add coverage area</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="stateCode">State</Label>
                  <Select
                    value={stateCode}
                    onValueChange={(val) => {
                      setStateCode(val);
                      setLgaId('');
                    }}
                  >
                    <SelectTrigger id="stateCode" className="h-11 w-full rounded-xl">
                      <SelectValue placeholder="Select state" />
                    </SelectTrigger>
                    <SelectContent>
                      {(statesQuery.data ?? []).map((state) => (
                        <SelectItem key={state.code} value={state.code}>
                          {state.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lgaId">LGA (optional)</Label>
                  <Select value={lgaId} onValueChange={setLgaId} disabled={!stateCode}>
                    <SelectTrigger id="lgaId" className="h-11 w-full rounded-xl">
                      <SelectValue placeholder="All LGAs in state" />
                    </SelectTrigger>
                    <SelectContent>
                      {(lgasQuery.data ?? []).map((lga) => (
                        <SelectItem key={lga.id} value={lga.id}>
                          {lga.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    setMessage(null);
                    setError(null);
                    addAreaMutation.mutate();
                  }}
                  disabled={addAreaMutation.isPending || !stateCode}
                >
                  {addAreaMutation.isPending ? 'Adding...' : 'Add coverage area'}
                </Button>
              </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Add shipping rate</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="serviceLevel">Service level</Label>
                  <Input
                    id="serviceLevel"
                    value={serviceLevel}
                    onChange={(event) => setServiceLevel(event.target.value)}
                    placeholder="STANDARD"
                  />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="flatFee">Flat fee</Label>
                    <Input
                      id="flatFee"
                      type="number"
                      min="0"
                      step="0.01"
                      value={flatFee}
                      onChange={(event) => setFlatFee(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="priority">Priority</Label>
                    <Input
                      id="priority"
                      type="number"
                      min="0"
                      value={priority}
                      onChange={(event) => setPriority(event.target.value)}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="minDeliveryDays">Min delivery days</Label>
                    <Input
                      id="minDeliveryDays"
                      type="number"
                      min="0"
                      value={minDeliveryDays}
                      onChange={(event) => setMinDeliveryDays(event.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="maxDeliveryDays">Max delivery days</Label>
                    <Input
                      id="maxDeliveryDays"
                      type="number"
                      min="0"
                      value={maxDeliveryDays}
                      onChange={(event) => setMaxDeliveryDays(event.target.value)}
                    />
                  </div>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    setMessage(null);
                    setError(null);
                    addRateMutation.mutate();
                  }}
                  disabled={addRateMutation.isPending || !flatFee.trim()}
                >
                  {addRateMutation.isPending ? 'Adding...' : 'Add shipping rate'}
                </Button>
                {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
                {error ? <p className="text-sm text-red-700">{error}</p> : null}
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
