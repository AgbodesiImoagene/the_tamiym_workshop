'use client';

import { AdminShell, formatAdminCurrency } from '@/components/admin-shell';
import { AdminStatusBadge } from '@/components/admin-status-badge';
import {
  downloadAdminAnalyticsCsv,
  getAdminCampaigns,
  getAdminMoneyMetrics,
  getAdminOrders,
  getAdminOverview,
  getAdminPayoutOverview,
} from '@/lib/dashboard';
import { CampaignStatus, OrderStatus, PaymentStatus, PayoutStatus } from '@tamiym/types';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  Skeleton,
  StatCard,
} from '@tamiym/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

function ActionQueueCard({
  title,
  description,
  href,
  count,
}: {
  title: string;
  description: string;
  href: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className="rounded-[1.5rem] border border-black/8 bg-white p-5 transition hover:border-primary/25 hover:shadow-sm"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-tamiym-blue">{title}</h3>
          <p className="text-sm leading-6 text-black/62">{description}</p>
        </div>
        <span className="rounded-full bg-primary px-3 py-1 text-sm font-semibold text-white">
          {count}
        </span>
      </div>
    </Link>
  );
}

export default function AdminDashboardPage() {
  const [rangeDraftFrom, setRangeDraftFrom] = useState('');
  const [rangeDraftTo, setRangeDraftTo] = useState('');
  const [appliedFrom, setAppliedFrom] = useState<string | undefined>();
  const [appliedTo, setAppliedTo] = useState<string | undefined>();

  const overviewQuery = useQuery({
    queryKey: ['admin-overview', appliedFrom, appliedTo],
    queryFn: () =>
      getAdminOverview({
        dateFrom: appliedFrom,
        dateTo: appliedTo,
      }),
  });
  const payoutOverviewQuery = useQuery({
    queryKey: ['admin-payout-overview'],
    queryFn: getAdminPayoutOverview,
  });
  const moneyMetricsQuery = useQuery({
    queryKey: ['admin-money-metrics'],
    queryFn: getAdminMoneyMetrics,
  });
  const ordersQuery = useQuery({
    queryKey: ['admin-orders', 'overview'],
    queryFn: getAdminOrders,
  });
  const campaignsQuery = useQuery({
    queryKey: ['admin-campaigns', 'overview'],
    queryFn: getAdminCampaigns,
  });

  const ordersNeedingIntervention =
    ordersQuery.data?.filter(
      (order) =>
        order.paymentStatus !== PaymentStatus.SUCCEEDED ||
        order.status === OrderStatus.PENDING_PAYMENT ||
        order.status === OrderStatus.CANCELLED
    ) ?? [];
  const campaignsForReview =
    campaignsQuery.data?.filter((campaign) => campaign.status === 'REVIEW') ?? [];
  const campaignsNeedingAttention =
    campaignsQuery.data?.filter(
      (campaign) =>
        campaign.status === 'REVIEW' ||
        campaign.status === CampaignStatus.PAUSED ||
        campaign.status === CampaignStatus.DISABLED
    ) ?? [];

  return (
    <AdminShell
      activeNav="overview"
      title="Operations overview"
      description="Use this page to route into the highest-priority queues instead of treating admin as a passive analytics dashboard."
    >
      <div className="space-y-8">
        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardHeader>
            <CardTitle>Overview period & exports</CardTitle>
            <CardDescription>
              Optional date range filters the top-row overview stats (counts use each record’s
              creation time). CSV exports use the same applied range. Leave blank for all time.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="flex flex-wrap items-end gap-4">
              <div className="space-y-2">
                <Label htmlFor="ov-from">From</Label>
                <Input
                  id="ov-from"
                  type="date"
                  value={rangeDraftFrom}
                  onChange={(e) => setRangeDraftFrom(e.target.value)}
                  className="w-44"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="ov-to">To</Label>
                <Input
                  id="ov-to"
                  type="date"
                  value={rangeDraftTo}
                  onChange={(e) => setRangeDraftTo(e.target.value)}
                  className="w-44"
                />
              </div>
              <Button
                type="button"
                variant="secondary"
                onClick={() => {
                  setAppliedFrom(rangeDraftFrom || undefined);
                  setAppliedTo(rangeDraftTo || undefined);
                }}
              >
                Apply to overview
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  downloadAdminAnalyticsCsv({
                    entity: 'orders',
                    dateFrom: appliedFrom,
                    dateTo: appliedTo,
                  })
                }
              >
                Download orders CSV
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() =>
                  downloadAdminAnalyticsCsv({
                    entity: 'campaigns',
                    dateFrom: appliedFrom,
                    dateTo: appliedTo,
                  })
                }
              >
                Download campaigns CSV
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
          <StatCard
            label="Total orders"
            value={String(overviewQuery.data?.ordersCount ?? 0)}
            helper="All order records"
            tone="brand"
          />
          <StatCard
            label="Paid orders"
            value={String(overviewQuery.data?.ordersPaidCount ?? 0)}
            helper="Payment succeeded"
            tone="accent"
          />
          <StatCard
            label="Active campaigns"
            value={String(overviewQuery.data?.campaignsActiveCount ?? 0)}
            helper="Currently live"
          />
          <StatCard
            label="Awaiting payout approval"
            value={String(payoutOverviewQuery.data?.pendingApprovalRunsCount ?? 0)}
            helper="Runs queued for sign-off"
          />
          <StatCard
            label="Failed payouts"
            value={String(payoutOverviewQuery.data?.failedPayoutsCount ?? 0)}
            helper="Needs retry or manual review"
          />
        </div>

        <div className="grid gap-4 xl:grid-cols-4">
          <ActionQueueCard
            title="Orders needing intervention"
            description="Jump into unpaid, cancelled, or otherwise blocked orders."
            href="/admin/orders?payment=attention"
            count={ordersNeedingIntervention.length}
          />
          <ActionQueueCard
            title="Campaign review queue"
            description="Open campaigns that are waiting for activation or rejection."
            href="/admin/campaigns?status=REVIEW"
            count={campaignsForReview.length}
          />
          <ActionQueueCard
            title="Payout approval queue"
            description="Review payout runs before funds move into execution."
            href="/admin/payouts/runs?status=PENDING_APPROVAL"
            count={payoutOverviewQuery.data?.pendingApprovalRunsCount ?? 0}
          />
          <ActionQueueCard
            title="Payout exceptions"
            description="Investigate failed payouts and manual adjustments that need a second admin."
            href="/admin/payouts/manual"
            count={
              (payoutOverviewQuery.data?.failedPayoutsCount ?? 0) +
              (moneyMetricsQuery.data?.pendingManualAdjustmentsCount ?? 0)
            }
          />
        </div>

        <div className="grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
          <Card className="rounded-[1.75rem] border-black/8 shadow-none">
            <CardHeader>
              <CardTitle>Financial posture</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl bg-[#f7f9fc] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-black/45">
                  Revenue tracked
                </p>
                <p className="mt-2 text-2xl font-semibold text-tamiym-blue">
                  {formatAdminCurrency(
                    Number(overviewQuery.data?.totalRevenue ?? 0),
                    overviewQuery.data?.currency ?? 'NGN'
                  )}
                </p>
                <p className="mt-2 text-sm text-black/60">
                  Gross revenue visible through overview analytics.
                </p>
              </div>
              <div className="rounded-2xl bg-[#f7f9fc] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-black/45">
                  Eligible ledger balance
                </p>
                <p className="mt-2 text-2xl font-semibold text-tamiym-blue">
                  {formatAdminCurrency(
                    Number(moneyMetricsQuery.data?.eligibleLedgerBalance ?? 0),
                    moneyMetricsQuery.data?.currency ?? 'NGN'
                  )}
                </p>
                <p className="mt-2 text-sm text-black/60">
                  Amount currently available to feed payout workflows.
                </p>
              </div>
              <div className="rounded-2xl bg-[#f7f9fc] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-black/45">
                  Paid out
                </p>
                <p className="mt-2 text-2xl font-semibold text-tamiym-blue">
                  {formatAdminCurrency(
                    Number(moneyMetricsQuery.data?.totalPaidOut ?? 0),
                    moneyMetricsQuery.data?.currency ?? 'NGN'
                  )}
                </p>
                <p className="mt-2 text-sm text-black/60">
                  Completed payouts recorded in the pipeline.
                </p>
              </div>
              <div className="rounded-2xl bg-[#f7f9fc] p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-black/45">
                  Manual approvals pending
                </p>
                <p className="mt-2 text-2xl font-semibold text-tamiym-blue">
                  {moneyMetricsQuery.data?.pendingManualAdjustmentsCount ?? 0}
                </p>
                <p className="mt-2 text-sm text-black/60">
                  Adjustments that still need second-admin approval.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-black/8 bg-slate-950 text-white shadow-none">
            <CardHeader>
              <CardTitle className="text-white">How this console is organized</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-white/75">
              <p>The left sidebar is job-oriented, not controller-oriented.</p>
              <p>
                Each queue uses list and detail routes so high-risk actions happen with context.
              </p>
              <p>
                Catalog, pricing, shipping, moderation, notifications, and settings already exist in
                the IA, but only first-slice workflows are fully built now.
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="rounded-[1.75rem] border-black/8 shadow-none">
            <CardHeader>
              <CardTitle>Orders needing action</CardTitle>
            </CardHeader>
            <CardContent>
              {ordersQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-2xl" />
                  ))}
                </div>
              ) : ordersQuery.isError ? (
                <p className="text-sm text-red-700">We could not load orders right now.</p>
              ) : ordersNeedingIntervention.length ? (
                <div className="space-y-3">
                  {ordersNeedingIntervention.slice(0, 5).map((order) => (
                    <Link
                      key={order.id}
                      href={`/admin/orders/${order.id}`}
                      className="block rounded-2xl border border-black/8 bg-[#f7f9fc] p-4 transition hover:border-primary/25"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-tamiym-blue">
                            {order.user.firstName || order.user.email}
                          </p>
                          <p className="text-xs text-black/55">{order.id}</p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <AdminStatusBadge value={order.status} />
                          <AdminStatusBadge value={order.paymentStatus} />
                        </div>
                      </div>
                      <p className="mt-3 text-sm font-medium text-black/75">
                        {formatAdminCurrency(Number(order.totalAmount), order.currency)}
                      </p>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No urgent orders"
                  description="Once unpaid or cancelled orders appear, this queue will surface them here."
                />
              )}
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-black/8 shadow-none">
            <CardHeader>
              <CardTitle>Campaign queue</CardTitle>
            </CardHeader>
            <CardContent>
              {campaignsQuery.isLoading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full rounded-2xl" />
                  ))}
                </div>
              ) : campaignsQuery.isError ? (
                <p className="text-sm text-red-700">We could not load campaigns right now.</p>
              ) : campaignsNeedingAttention.length ? (
                <div className="space-y-3">
                  {campaignsNeedingAttention.slice(0, 5).map((campaign) => (
                    <Link
                      key={campaign.id}
                      href={`/admin/campaigns/${campaign.id}`}
                      className="block rounded-2xl border border-black/8 bg-[#f7f9fc] p-4 transition hover:border-primary/25"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="space-y-1">
                          <p className="text-sm font-semibold text-tamiym-blue">{campaign.title}</p>
                          <p className="text-xs text-black/55">{campaign.slug}</p>
                        </div>
                        <AdminStatusBadge value={campaign.status} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {campaign.moderationStatus ? (
                          <AdminStatusBadge value={campaign.moderationStatus} />
                        ) : null}
                        {campaign.payoutModeOverride ? (
                          <AdminStatusBadge value={campaign.payoutModeOverride} />
                        ) : null}
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <EmptyState
                  title="No campaigns need review"
                  description="Campaigns in review, paused, or disabled states will surface here."
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 xl:grid-cols-2">
          <Card className="rounded-[1.75rem] border-black/8 shadow-none">
            <CardHeader>
              <CardTitle>Payout reliability</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 text-sm leading-6 text-black/65">
              <div className="flex items-center justify-between rounded-2xl bg-[#f7f9fc] px-4 py-3">
                <span>Run count</span>
                <span className="font-semibold text-tamiym-blue">
                  {payoutOverviewQuery.data?.payoutRunsCount ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-[#f7f9fc] px-4 py-3">
                <span>Total payouts</span>
                <span className="font-semibold text-tamiym-blue">
                  {payoutOverviewQuery.data?.payoutsCount ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-[#f7f9fc] px-4 py-3">
                <span>Failed payouts</span>
                <span className="font-semibold text-tamiym-blue">
                  {payoutOverviewQuery.data?.failedPayoutsCount ?? 0}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-2xl bg-[#f7f9fc] px-4 py-3">
                <span>Money pipeline status</span>
                <AdminStatusBadge
                  value={
                    (payoutOverviewQuery.data?.failedPayoutsCount ?? 0) > 0
                      ? PayoutStatus.FAILED
                      : 'STABLE'
                  }
                />
              </div>
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-black/8 shadow-none">
            <CardHeader>
              <CardTitle>First-slice route map</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm text-black/65">
              {[
                '/admin/orders',
                '/admin/orders/[id]',
                '/admin/campaigns',
                '/admin/campaigns/[id]',
                '/admin/payouts/runs',
                '/admin/payouts/runs/[id]',
                '/admin/payouts/manual',
              ].map((route) => (
                <div key={route} className="rounded-2xl bg-[#f7f9fc] px-4 py-3 font-mono text-xs">
                  {route}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
