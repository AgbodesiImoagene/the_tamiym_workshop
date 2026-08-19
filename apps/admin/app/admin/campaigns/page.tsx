'use client';

import { AdminShell, formatAdminCurrency } from '@/components/admin-shell';
import { AdminStatusBadge } from '@/components/admin-status-badge';
import { getAdminCampaignsByStatus } from '@/lib/dashboard';
import { CampaignStatus } from '@tamiym/types';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Label } from '@tamiym/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, Suspense } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const statusOptions = ['ALL', ...Object.values(CampaignStatus)];

function AdminCampaignsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = searchParams.get('status') ?? 'ALL';
  const query = searchParams.get('q') ?? '';

  const campaignsQuery = useQuery({
    queryKey: ['admin-campaigns', status],
    queryFn: () => getAdminCampaignsByStatus(status === 'ALL' ? undefined : status),
  });

  const filteredCampaigns = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return (campaignsQuery.data ?? []).filter((campaign) => {
      if (!normalizedQuery) return true;

      return [
        campaign.title,
        campaign.slug,
        campaign.organizer?.email ?? '',
        campaign.organizer?.firstName ?? '',
        campaign.organizer?.lastName ?? '',
      ]
        .join(' ')
        .toLowerCase()
        .includes(normalizedQuery);
    });
  }, [campaignsQuery.data, query]);

  function updateFilter(name: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || value === 'ALL') {
      next.delete(name);
    } else {
      next.set(name, value);
    }
    router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname);
  }

  return (
    <AdminShell
      activeNav="campaigns"
      title="Campaigns workspace"
      description="Review fundraising campaigns, moderate their readiness, and adjust payout policy with enough context before a live status change."
    >
      <div className="space-y-6">
        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="status">Campaign status</Label>
              <select
                id="status"
                value={status}
                onChange={(event) => updateFilter('status', event.target.value)}
                className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="query">Organizer or campaign</Label>
              <Input
                id="query"
                value={query}
                onChange={(event) => updateFilter('q', event.target.value)}
                placeholder="Search by campaign, slug, or organizer"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardHeader>
            <CardTitle>Campaign queue</CardTitle>
          </CardHeader>
          <CardContent>
            {campaignsQuery.isLoading ? (
              <p className="text-sm text-black/55">Loading campaigns...</p>
            ) : campaignsQuery.isError ? (
              <p className="text-sm text-red-700">We could not load admin campaigns right now.</p>
            ) : filteredCampaigns.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-3">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                      <th className="px-4 py-2">Campaign</th>
                      <th className="px-4 py-2">Organizer</th>
                      <th className="px-4 py-2">Progress</th>
                      <th className="px-4 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCampaigns.map((campaign) => (
                      <tr key={campaign.id} className="bg-white">
                        <td className="rounded-l-2xl border-y border-l border-black/8 px-4 py-4">
                          <Link
                            href={`/admin/campaigns/${campaign.id}`}
                            className="block text-sm font-semibold text-tamiym-blue"
                          >
                            {campaign.title}
                          </Link>
                          <p className="mt-1 text-xs text-black/55">{campaign.slug}</p>
                        </td>
                        <td className="border-y border-black/8 px-4 py-4 text-sm text-black/68">
                          <p className="font-medium text-black">
                            {[campaign.organizer?.firstName, campaign.organizer?.lastName]
                              .filter(Boolean)
                              .join(' ') || 'Unknown organizer'}
                          </p>
                          <p className="text-xs text-black/55">{campaign.organizer?.email ?? 'No email'}</p>
                        </td>
                        <td className="border-y border-black/8 px-4 py-4 text-sm text-black/68">
                          <p>
                            Raised{' '}
                            {formatAdminCurrency(
                              Number(campaign.currentAmount ?? 0),
                              campaign.currency,
                            )}
                          </p>
                          <p className="text-xs text-black/55">
                            Goal:{' '}
                            {campaign.goalAmount != null
                              ? formatAdminCurrency(Number(campaign.goalAmount), campaign.currency)
                              : 'Not set'}
                          </p>
                        </td>
                        <td className="rounded-r-2xl border-y border-r border-black/8 px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <AdminStatusBadge value={campaign.status} />
                            {campaign.moderationStatus ? (
                              <AdminStatusBadge value={campaign.moderationStatus} />
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No campaigns match these filters"
                description="Clear the filters to reopen the full campaign review queue."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}

export default function AdminCampaignsPage() {
  return (
    <Suspense
      fallback={
        <AdminShell
          activeNav="campaigns"
          title="Campaigns workspace"
          description="Review fundraising campaigns, moderate their readiness, and adjust payout policy with enough context before a live status change."
        >
          <p className="text-sm text-black/55">Loading campaigns...</p>
        </AdminShell>
      }
    >
      <AdminCampaignsPageContent />
    </Suspense>
  );
}
