'use client';

import { AdminShell, formatAdminDate } from '@/components/admin-shell';
import {
  createAdminShippingZone,
  getAdminShippingZones,
  type AdminShippingZone,
} from '@/lib/shipping';
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
  Skeleton,
  Textarea,
} from '@tamiym/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

function ZoneCard({ zone }: { zone: AdminShippingZone }) {
  return (
    <div className="rounded-2xl border border-black/8 bg-white px-5 py-4">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-sm font-semibold text-tamiym-blue">{zone.name}</p>
          <p className="text-xs text-black/50">Updated {formatAdminDate(zone.updatedAt)}</p>
        </div>
        <span
          className={`rounded-full px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] ${
            zone.isActive ? 'bg-accent text-tamiym-blue' : 'bg-slate-100 text-slate-600'
          }`}
        >
          {zone.isActive ? 'Active' : 'Inactive'}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-4 text-xs text-black/60">
        <span>{zone.areas.length} area(s)</span>
        <span>{zone.rules.length} rule(s)</span>
        <span>{zone.rates.length} rate(s)</span>
      </div>

      <div className="mt-4">
        <Link
          href={`/admin/shipping/zones/${zone.id}`}
          className="inline-flex h-10 items-center justify-center rounded-xl bg-primary px-4 text-sm font-medium text-white transition hover:bg-primary-600"
        >
          Open zone
        </Link>
      </div>
    </div>
  );
}

export default function AdminShippingZonesPage() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const zonesQuery = useQuery({
    queryKey: ['admin-shipping-zones'],
    queryFn: getAdminShippingZones,
  });

  const createZoneMutation = useMutation({
    mutationFn: () =>
      createAdminShippingZone({
        name: name.trim(),
        isActive,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-shipping-zones'] });
      setMessage('Shipping zone created.');
      setError(null);
      setName('');
      setIsActive(true);
    },
    onError: (mutationError: { message?: string }) => {
      setError(mutationError.message || 'We could not create the shipping zone.');
      setMessage(null);
    },
  });

  return (
    <AdminShell
      activeNav="shipping"
      title="Shipping zones"
      description="Create and monitor delivery zones, then drill into each one to manage areas and active shipping rates."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardHeader>
            <CardTitle>Zone list</CardTitle>
            <CardDescription>
              Each zone groups delivery coverage, matching rules, and rate cards.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {zonesQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-2xl" />
                ))}
              </div>
            ) : zonesQuery.isError ? (
              <p className="text-sm text-red-700">We could not load shipping zones right now.</p>
            ) : zonesQuery.data && zonesQuery.data.length > 0 ? (
              zonesQuery.data.map((zone) => <ZoneCard key={zone.id} zone={zone} />)
            ) : (
              <EmptyState
                title="No shipping zones yet"
                description="Create the first zone to start configuring delivery coverage and pricing."
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[1.75rem] border-black/8 shadow-none">
            <CardHeader>
              <CardTitle>Create zone</CardTitle>
              <CardDescription>
                Start with a zone shell, then configure areas and rates from the detail screen.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="zoneName">Zone name</Label>
                <Input
                  id="zoneName"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Lagos Mainland"
                />
              </div>

              <label className="flex items-start gap-3 rounded-2xl border border-black/8 bg-[#f7f9fc] p-4">
                <Checkbox
                  className="mt-1"
                  checked={isActive}
                  onCheckedChange={(checked) => setIsActive(checked as boolean)}
                />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-black">Zone is active</p>
                  <p className="text-xs leading-5 text-black/60">
                    Active zones can immediately participate in shipping resolution.
                  </p>
                </div>
              </label>

              <Button
                className="w-full"
                onClick={() => {
                  setMessage(null);
                  setError(null);
                  createZoneMutation.mutate();
                }}
                disabled={createZoneMutation.isPending || !name.trim()}
              >
                {createZoneMutation.isPending ? 'Creating...' : 'Create zone'}
              </Button>

              {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
              {error ? <p className="text-sm text-red-700">{error}</p> : null}
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-black/8 shadow-none">
            <CardHeader>
              <CardTitle>Operational note</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-black/65">
              <p>
                Use the zone detail page to map Nigeria states/LGAs into a zone and attach concrete
                shipping rates.
              </p>
              <p>
                Rules are generated automatically when you add areas, so the first useful workflow
                is zone → area → rate.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
