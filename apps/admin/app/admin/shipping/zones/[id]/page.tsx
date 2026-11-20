'use client';

/* eslint-disable react-hooks/set-state-in-effect -- Loaded zone data intentionally initializes the local edit form. */

import { AdminShell, formatAdminCurrency, formatAdminDate } from '@/components/admin-shell';
import {
  type AdminShippingRate,
  type UncoveredState,
  createAdminShippingRate,
  createAdminShippingZoneArea,
  deleteAdminShippingRate,
  deleteAdminShippingRule,
  deleteAdminShippingZone,
  deleteAdminShippingZoneArea,
  getAdminGeoLgas,
  getAdminGeoStates,
  getAdminShippingZone,
  getUncoveredStates,
  updateAdminShippingRate,
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
  ConfirmDialog,
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
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';

type ZoneFormState = {
  name: string;
  isActive: boolean;
};

type RateEditState = {
  serviceLevel: string;
  flatFee: string;
  priority: string;
  minDeliveryDays: string;
  maxDeliveryDays: string;
  isActive: boolean;
};

/**
 * TTW-097: a correction or deletion. `run(false)` is tried first; when the API
 * answers that states would lose delivery, the admin is warned and confirms
 * before `run(true)`.
 */
type PendingAction = {
  title: string;
  description: string;
  confirmLabel: string;
  successMessage: string;
  run: (confirmed: boolean) => Promise<unknown>;
  onDone?: () => void;
  /** True when the action deletes the zone shown on this page. */
  removesZone?: boolean;
  warning?: UncoveredState[];
};

export default function AdminShippingZoneDetailPage() {
  const params = useParams<{ id: string }>();
  const zoneId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const loadedZoneKey = useRef<string | null>(null);
  const [editingRateId, setEditingRateId] = useState<string | null>(null);
  const [rateEdit, setRateEdit] = useState<RateEditState | null>(null);
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
    // Reload the form only for another zone or a saved change, not on every
    // refetch (a rate edit must not wipe a name being typed).
    const key = zoneQuery.data ? `${zoneQuery.data.id}:${zoneQuery.data.updatedAt}` : null;
    if (zoneQuery.data && key !== loadedZoneKey.current) {
      loadedZoneKey.current = key;
      setZoneForm({
        name: zoneQuery.data.name,
        isActive: zoneQuery.data.isActive,
      });
    }
  }, [zoneQuery.data]);

  async function execute(action: PendingAction, confirmed: boolean) {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      await action.run(confirmed);
      if (action.removesZone) {
        // The zone is gone: drop its cache entry instead of refetching a 404.
        queryClient.removeQueries({ queryKey: ['admin-shipping-zone', zoneId] });
      } else {
        await queryClient.invalidateQueries({ queryKey: ['admin-shipping-zone', zoneId] });
      }
      await queryClient.invalidateQueries({ queryKey: ['admin-shipping-zones'] });
      setPending(null);
      setMessage(action.successMessage);
      action.onDone?.();
    } catch (actionError) {
      const uncovered = confirmed ? null : getUncoveredStates(actionError);
      if (uncovered) {
        setPending({ ...action, warning: uncovered });
        setDialogOpen(true);
      } else {
        setPending(null);
        setError((actionError as { message?: string }).message || 'We could not save this change.');
      }
    } finally {
      setBusy(false);
    }
  }

  function askToConfirm(action: PendingAction) {
    setMessage(null);
    setError(null);
    setPending(action);
    setDialogOpen(true);
  }

  function startEditingRate(rate: AdminShippingRate) {
    setEditingRateId(rate.id);
    setRateEdit({
      serviceLevel: rate.serviceLevel,
      flatFee: String(Number(rate.flatFee)),
      priority: String(rate.priority),
      minDeliveryDays: rate.minDeliveryDays != null ? String(rate.minDeliveryDays) : '',
      maxDeliveryDays: rate.maxDeliveryDays != null ? String(rate.maxDeliveryDays) : '',
      isActive: rate.isActive,
    });
  }

  function saveRate(rateId: string) {
    if (!rateEdit) return;
    void execute(
      {
        title: 'Save rate',
        description: '',
        confirmLabel: 'Save',
        successMessage: 'Shipping rate updated. Existing orders keep the fee they were charged.',
        run: (confirmed) =>
          updateAdminShippingRate(
            rateId,
            {
              serviceLevel: rateEdit.serviceLevel.trim() || 'STANDARD',
              flatFee: Number(rateEdit.flatFee),
              priority: Number(rateEdit.priority),
              isActive: rateEdit.isActive,
              minDeliveryDays: rateEdit.minDeliveryDays ? Number(rateEdit.minDeliveryDays) : null,
              maxDeliveryDays: rateEdit.maxDeliveryDays ? Number(rateEdit.maxDeliveryDays) : null,
            },
            confirmed
          ),
        onDone: () => {
          setEditingRateId(null);
          setRateEdit(null);
        },
      },
      false
    );
  }

  const dialogDescription = pending
    ? pending.warning
      ? `${pending.warning.map((state) => state.name).join(', ')} would no longer have any delivery rate, so delivery quotes for customers there would stop working. ${pending.description}`
      : pending.description
    : undefined;

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
        <div className="space-y-6">
          {message ? (
            <p role="status" className="text-sm text-emerald-700">
              {message}
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
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
                        className="flex items-start justify-between gap-3 rounded-2xl border border-black/8 bg-white px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-tamiym-blue">
                            {area.state.name}
                            {area.lga ? ` · ${area.lga.name}` : ' · All LGAs'}
                          </p>
                          <p className="mt-1 text-xs text-black/55">State code: {area.stateCode}</p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() => {
                            const label = area.lga
                              ? `${area.state.name} · ${area.lga.name}`
                              : area.state.name;
                            askToConfirm({
                              title: `Remove ${label} from this zone?`,
                              description:
                                'Addresses there will no longer match this zone. The matching delivery rule is removed too.',
                              confirmLabel: 'Remove',
                              successMessage: `${label} removed from this zone.`,
                              run: (confirmed) =>
                                deleteAdminShippingZoneArea(zoneId, area.id, confirmed),
                            });
                          }}
                        >
                          Remove
                          <span className="sr-only">
                            {' '}
                            {area.state.name}
                            {area.lga ? ` ${area.lga.name}` : ''}
                          </span>
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-black/55">No areas mapped to this zone yet.</p>
                  )}
                </CardContent>
              </Card>

              <Card className="rounded-[1.75rem] border-black/8 shadow-none">
                <CardHeader>
                  <CardTitle>Delivery rules</CardTitle>
                  <CardDescription>
                    Rules decide which addresses belong to this zone. Adding a coverage area creates
                    one.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {zoneQuery.data.rules.length ? (
                    zoneQuery.data.rules.map((rule) => (
                      <div
                        key={rule.id}
                        className="flex items-start justify-between gap-3 rounded-2xl border border-black/8 bg-white px-4 py-3"
                      >
                        <div>
                          <p className="text-sm font-semibold text-tamiym-blue">
                            {rule.matchType} · {rule.matchValue}
                            {rule.matchContext ? ` (${rule.matchContext})` : ''}
                          </p>
                          <p className="mt-1 text-xs text-black/55">
                            {rule.countryCode} · Priority {rule.priority} ·{' '}
                            {rule.isActive ? 'Active' : 'Inactive'}
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={busy}
                          onClick={() =>
                            askToConfirm({
                              title: 'Delete this delivery rule?',
                              description: 'Addresses it matched will no longer map to this zone.',
                              confirmLabel: 'Delete rule',
                              successMessage: 'Delivery rule deleted.',
                              run: (confirmed) => deleteAdminShippingRule(rule.id, confirmed),
                            })
                          }
                        >
                          Delete
                          <span className="sr-only"> rule {rule.matchValue}</span>
                        </Button>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-black/55">No delivery rules for this zone yet.</p>
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
                          {rate.isActive ? '' : ' · Inactive'}
                        </p>
                        {editingRateId === rate.id && rateEdit ? (
                          <div className="mt-4 space-y-4 border-t border-black/8 pt-4">
                            <div className="space-y-2">
                              <Label htmlFor={`edit-service-${rate.id}`}>Service level</Label>
                              <Input
                                id={`edit-service-${rate.id}`}
                                value={rateEdit.serviceLevel}
                                onChange={(event) =>
                                  setRateEdit({ ...rateEdit, serviceLevel: event.target.value })
                                }
                              />
                            </div>
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <Label htmlFor={`edit-fee-${rate.id}`}>Flat fee</Label>
                                <Input
                                  id={`edit-fee-${rate.id}`}
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={rateEdit.flatFee}
                                  onChange={(event) =>
                                    setRateEdit({ ...rateEdit, flatFee: event.target.value })
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`edit-priority-${rate.id}`}>Priority</Label>
                                <Input
                                  id={`edit-priority-${rate.id}`}
                                  type="number"
                                  min="0"
                                  value={rateEdit.priority}
                                  onChange={(event) =>
                                    setRateEdit({ ...rateEdit, priority: event.target.value })
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`edit-min-${rate.id}`}>Min delivery days</Label>
                                <Input
                                  id={`edit-min-${rate.id}`}
                                  type="number"
                                  min="0"
                                  value={rateEdit.minDeliveryDays}
                                  onChange={(event) =>
                                    setRateEdit({
                                      ...rateEdit,
                                      minDeliveryDays: event.target.value,
                                    })
                                  }
                                />
                              </div>
                              <div className="space-y-2">
                                <Label htmlFor={`edit-max-${rate.id}`}>Max delivery days</Label>
                                <Input
                                  id={`edit-max-${rate.id}`}
                                  type="number"
                                  min="0"
                                  value={rateEdit.maxDeliveryDays}
                                  onChange={(event) =>
                                    setRateEdit({
                                      ...rateEdit,
                                      maxDeliveryDays: event.target.value,
                                    })
                                  }
                                />
                              </div>
                            </div>
                            <label className="flex items-center gap-3 text-sm">
                              <Checkbox
                                checked={rateEdit.isActive}
                                onCheckedChange={(checked) =>
                                  setRateEdit({ ...rateEdit, isActive: checked as boolean })
                                }
                              />
                              Rate is active
                            </label>
                            <div className="flex gap-2">
                              <Button
                                size="sm"
                                disabled={busy || !rateEdit.flatFee.trim()}
                                onClick={() => saveRate(rate.id)}
                              >
                                {busy ? 'Saving...' : 'Save rate'}
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={busy}
                                onClick={() => {
                                  setEditingRateId(null);
                                  setRateEdit(null);
                                }}
                              >
                                Cancel
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="mt-3 flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() => startEditingRate(rate)}
                            >
                              Edit
                              <span className="sr-only"> {rate.serviceLevel} rate</span>
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={busy}
                              onClick={() =>
                                askToConfirm({
                                  title: `Delete the ${rate.serviceLevel} rate?`,
                                  description:
                                    'Existing orders keep the fee they were charged; only new quotes are affected.',
                                  confirmLabel: 'Delete rate',
                                  successMessage: 'Shipping rate deleted.',
                                  run: (confirmed) => deleteAdminShippingRate(rate.id, confirmed),
                                })
                              }
                            >
                              Delete
                              <span className="sr-only"> {rate.serviceLevel} rate</span>
                            </Button>
                          </div>
                        )}
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
                    onClick={() =>
                      void execute(
                        {
                          title: 'Save zone',
                          description: '',
                          confirmLabel: 'Save',
                          successMessage: 'Zone details updated.',
                          run: (confirmed) =>
                            updateAdminShippingZone(
                              zoneId,
                              { name: zoneForm.name.trim(), isActive: zoneForm.isActive },
                              confirmed
                            ),
                        },
                        false
                      )
                    }
                    disabled={busy || !zoneForm.name.trim()}
                  >
                    {busy ? 'Saving...' : 'Save zone'}
                  </Button>
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() =>
                      askToConfirm({
                        title: `Delete zone “${zoneQuery.data?.name ?? ''}”?`,
                        description:
                          'The zone, its areas, rules and rates are deleted for good. Existing orders keep the fee they were charged.',
                        confirmLabel: 'Delete zone',
                        successMessage: 'Zone deleted.',
                        run: (confirmed) => deleteAdminShippingZone(zoneId, confirmed),
                        removesZone: true,
                        onDone: () => router.push('/admin/shipping/zones'),
                      })
                    }
                    disabled={busy}
                  >
                    Delete zone
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
                          <SelectItem
                            key={state.code}
                            value={state.code}
                            disabled={!state.isActive}
                          >
                            {state.isActive ? state.name : `${state.name} (deactivated)`}
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
                          <SelectItem key={lga.id} value={lga.id} disabled={!lga.isActive}>
                            {lga.isActive ? lga.name : `${lga.name} (deactivated)`}
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
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      )}
      <ConfirmDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={
          pending?.warning ? `${pending.title.replace(/\?$/, '')} anyway?` : (pending?.title ?? '')
        }
        description={dialogDescription}
        confirmLabel={pending?.warning ? 'Yes, continue' : (pending?.confirmLabel ?? 'Confirm')}
        destructive
        onConfirm={() => {
          if (pending) void execute(pending, Boolean(pending.warning));
        }}
      />
    </AdminShell>
  );
}
