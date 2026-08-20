'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminShell, formatAdminCurrency, formatAdminDate } from '@/components/admin-shell';
import { AdminStatusBadge } from '@/components/admin-status-badge';
import { ModerationQueueNav } from '@/components/moderation-queue-nav';
import { getAdminCampaigns, type AdminCampaign } from '@/lib/dashboard';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@tamiym/ui';

type QueueFilter = 'REVIEW' | 'BLOCKED' | 'LIVE' | 'ALL';

const queueFilters: Array<{ label: string; value: QueueFilter }> = [
  { label: 'Review queue', value: 'REVIEW' },
  { label: 'Blocked', value: 'BLOCKED' },
  { label: 'Live', value: 'LIVE' },
  { label: 'All', value: 'ALL' },
];

function organizerLabel(campaign: AdminCampaign) {
  const name = [campaign.organizer?.firstName, campaign.organizer?.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();
  return name || campaign.organizer?.email || 'Unknown organizer';
}

function getDesignBlockers(campaign: AdminCampaign) {
  return (campaign.products ?? [])
    .filter((entry) => entry.design && entry.design.moderationStatus !== 'APPROVED')
    .map((entry) => `${entry.product.name} (${entry.design!.moderationStatus})`);
}

export default function AdminModerationCampaignsPage() {
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('REVIEW');
  const [search, setSearch] = useState('');

  const {
    data: campaigns,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin-campaigns', 'moderation'],
    queryFn: () => getAdminCampaigns(),
  });

  const filteredCampaigns = useMemo(() => {
    const query = search.trim().toLowerCase();

    return (campaigns ?? []).filter((campaign) => {
      const blockers = getDesignBlockers(campaign);
      const matchesQueue =
        queueFilter === 'ALL'
          ? true
          : queueFilter === 'REVIEW'
            ? campaign.status === 'REVIEW'
            : queueFilter === 'BLOCKED'
              ? blockers.length > 0 ||
                campaign.moderationStatus === 'FLAGGED' ||
                campaign.moderationStatus === 'REJECTED'
              : campaign.status === 'ACTIVE';

      if (!matchesQueue) return false;
      if (!query) return true;

      return [campaign.title, campaign.slug, campaign.organizer?.email, organizerLabel(campaign)]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(query));
    });
  }, [campaigns, queueFilter, search]);

  const reviewCount = useMemo(
    () => (campaigns ?? []).filter((campaign) => campaign.status === 'REVIEW').length,
    [campaigns]
  );
  const blockedCount = useMemo(
    () =>
      (campaigns ?? []).filter((campaign) => {
        const blockers = getDesignBlockers(campaign);
        return (
          blockers.length > 0 ||
          campaign.moderationStatus === 'FLAGGED' ||
          campaign.moderationStatus === 'REJECTED'
        );
      }).length,
    [campaigns]
  );
  const liveCount = useMemo(
    () => (campaigns ?? []).filter((campaign) => campaign.status === 'ACTIVE').length,
    [campaigns]
  );

  return (
    <AdminShell
      activeNav="moderation"
      title="Campaign moderation"
      description="Review fundraiser submissions, inspect AI-screened designs, and approve or reject campaigns before they go live."
    >
      <ModerationQueueNav />

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="rounded-[1.5rem] border-black/8 shadow-none">
          <CardContent className="space-y-1 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
              Needs review
            </p>
            <p className="text-2xl font-semibold text-tamiym-blue">{reviewCount}</p>
            <p className="text-sm text-black/55">Campaigns currently waiting in `REVIEW`.</p>
          </CardContent>
        </Card>
        <Card className="rounded-[1.5rem] border-black/8 shadow-none">
          <CardContent className="space-y-1 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
              Blocked
            </p>
            <p className="text-2xl font-semibold text-amber-700">{blockedCount}</p>
            <p className="text-sm text-black/55">
              Campaigns with flagged or rejected designs/content.
            </p>
          </CardContent>
        </Card>
        <Card className="rounded-[1.5rem] border-black/8 shadow-none">
          <CardContent className="space-y-1 py-5">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">Live</p>
            <p className="text-2xl font-semibold text-emerald-700">{liveCount}</p>
            <p className="text-sm text-black/55">Approved campaigns already active on the site.</p>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 rounded-[1.75rem] border-black/8 shadow-none">
        <CardHeader className="gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <CardTitle>Queue</CardTitle>
            <p className="mt-1 text-sm text-black/55">
              Filter by moderation outcome, then drill into the full campaign review workspace.
            </p>
          </div>
          <div className="w-full md:max-w-xs">
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search title, slug, or organizer"
            />
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex flex-wrap gap-2">
            <Tabs value={queueFilter} onValueChange={(val) => setQueueFilter(val as QueueFilter)}>
              <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
                {queueFilters.map((filter) => (
                  <TabsTrigger
                    key={filter.value}
                    value={filter.value}
                    className="h-auto rounded-xl px-4 py-2 text-sm font-medium data-active:bg-primary data-active:text-white data-active:shadow-xs"
                  >
                    {filter.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>

          {isLoading ? (
            <div className="space-y-3 py-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-2xl" />
              ))}
            </div>
          ) : isError ? (
            <div className="py-12 text-center text-sm text-red-600">
              Failed to load campaign moderation queue.
            </div>
          ) : filteredCampaigns.length > 0 ? (
            <div className="space-y-3">
              {filteredCampaigns.map((campaign) => {
                const blockers = getDesignBlockers(campaign);

                return (
                  <div
                    key={campaign.id}
                    className="rounded-2xl border border-black/8 bg-white px-5 py-4 shadow-xs"
                  >
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Link
                            href={`/admin/moderation/campaigns/${campaign.id}`}
                            className="truncate text-base font-semibold text-foreground hover:underline"
                          >
                            {campaign.title}
                          </Link>
                          <AdminStatusBadge value={campaign.status} />
                          {campaign.moderationStatus ? (
                            <AdminStatusBadge value={campaign.moderationStatus} />
                          ) : null}
                        </div>

                        <p className="mt-1 text-sm text-black/55">
                          {organizerLabel(campaign)}
                          {campaign.organizer?.email &&
                          organizerLabel(campaign) !== campaign.organizer.email
                            ? ` · ${campaign.organizer.email}`
                            : ''}
                          {' · '}
                          Submitted{' '}
                          {formatAdminDate(
                            campaign.updatedAt ?? campaign.createdAt ?? new Date().toISOString()
                          )}
                        </p>

                        <p className="mt-2 text-sm text-black/65">
                          Raised{' '}
                          <span className="font-medium text-black">
                            {formatAdminCurrency(
                              Number(campaign.currentAmount ?? 0),
                              campaign.currency
                            )}
                          </span>
                          {campaign.goalAmount != null
                            ? ` of ${formatAdminCurrency(Number(campaign.goalAmount), campaign.currency)}`
                            : ''}
                        </p>

                        {campaign.rejectionReason ? (
                          <p className="mt-2 rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">
                            Rejection reason: {campaign.rejectionReason}
                          </p>
                        ) : null}

                        {campaign.moderationNotes ? (
                          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-800">
                            AI note: {campaign.moderationNotes}
                          </p>
                        ) : null}

                        {blockers.length > 0 ? (
                          <p className="mt-2 text-sm text-amber-700">
                            Design blockers: {blockers.join(', ')}
                          </p>
                        ) : null}
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        <span className="text-xs text-black/45">
                          {(campaign.products ?? []).length} linked product
                          {(campaign.products ?? []).length === 1 ? '' : 's'}
                        </span>
                        <Link href={`/admin/moderation/campaigns/${campaign.id}`}>
                          <Button size="sm">Open review</Button>
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <EmptyState
              title="No campaigns found"
              description="No campaigns match this moderation filter yet."
            />
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
