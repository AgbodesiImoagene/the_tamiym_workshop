'use client';

import { AdminShell, formatAdminCurrency, formatAdminDate } from '@/components/admin-shell';
import { AdminStatusBadge } from '@/components/admin-status-badge';
import {
  activateAdminCampaign,
  getAdminCampaignSnapshot,
  getAdminCampaigns,
  updateAdminCampaignPayoutPolicy,
  updateAdminCampaignStatus,
  rejectAdminCampaign,
} from '@/lib/dashboard';
import { CampaignStatus } from '@tamiym/types';
import { Button, Card, CardContent, CardHeader, CardTitle, Label, Textarea } from '@tamiym/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

const payoutPolicyOptions = [
  { value: 'keep', label: 'Use site default' },
  { value: 'MANUAL', label: 'Manual payout mode' },
  { value: 'AUTO_APPROVAL_REQUIRED', label: 'Auto with admin approval' },
  { value: 'AUTO_EXECUTE', label: 'Auto execute' },
];

const statusOptions = [
  CampaignStatus.PAUSED,
  CampaignStatus.DISABLED,
  CampaignStatus.ENDED,
  CampaignStatus.DRAFT,
];

export default function AdminCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params.id;
  const queryClient = useQueryClient();
  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(CampaignStatus.PAUSED);
  const [selectedPayoutPolicy, setSelectedPayoutPolicy] = useState('keep');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const campaignsQuery = useQuery({
    queryKey: ['admin-campaigns', 'detail-source'],
    queryFn: getAdminCampaigns,
  });
  const campaign = useMemo(
    () => campaignsQuery.data?.find((entry) => entry.id === campaignId),
    [campaignId, campaignsQuery.data]
  );
  const snapshotQuery = useQuery({
    queryKey: ['admin-campaign-snapshot', campaignId],
    queryFn: () => getAdminCampaignSnapshot(campaignId),
    enabled: !!campaign,
  });

  async function refreshCampaignData() {
    await queryClient.invalidateQueries({ queryKey: ['admin-campaigns'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-campaign-snapshot', campaignId] });
  }

  const activateMutation = useMutation({
    mutationFn: () => activateAdminCampaign(campaignId),
    onSuccess: async () => {
      setMessage('Campaign activated successfully.');
      setError(null);
      await refreshCampaignData();
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Campaign activation failed.');
      setMessage(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () => rejectAdminCampaign(campaignId, rejectionReason, rejectionNotes || undefined),
    onSuccess: async () => {
      setMessage('Campaign rejected and returned to draft.');
      setError(null);
      setRejectionReason('');
      setRejectionNotes('');
      await refreshCampaignData();
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Campaign rejection failed.');
      setMessage(null);
    },
  });

  const statusMutation = useMutation({
    mutationFn: () => updateAdminCampaignStatus(campaignId, selectedStatus),
    onSuccess: async () => {
      setMessage('Campaign status updated.');
      setError(null);
      await refreshCampaignData();
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Campaign status update failed.');
      setMessage(null);
    },
  });

  const payoutPolicyMutation = useMutation({
    mutationFn: () =>
      updateAdminCampaignPayoutPolicy(
        campaignId,
        selectedPayoutPolicy === 'keep' ? null : selectedPayoutPolicy
      ),
    onSuccess: async () => {
      setMessage('Payout policy updated.');
      setError(null);
      await refreshCampaignData();
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Payout policy update failed.');
      setMessage(null);
    },
  });

  return (
    <AdminShell
      activeNav="campaigns"
      title="Campaign detail"
      description="Campaign review, intervention, and payout-policy controls are grouped here so status changes happen with fundraising context."
    >
      {campaignsQuery.isLoading ? (
        <p className="text-sm text-black/55">Loading campaign detail...</p>
      ) : !campaign ? (
        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardContent className="space-y-4 p-8">
            <h2 className="text-xl font-semibold text-tamiym-blue">Campaign unavailable</h2>
            <p className="text-sm text-black/65">
              This campaign could not be found in the admin queue response.
            </p>
            <Link
              href="/admin/campaigns"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-medium text-accent-foreground"
            >
              Back to campaigns
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Campaign summary</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Campaign
                  </p>
                  <p className="mt-2 text-lg font-semibold text-tamiym-blue">{campaign.title}</p>
                  <p className="mt-1 text-sm text-black/55">{campaign.slug}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <AdminStatusBadge value={campaign.status} />
                    {campaign.moderationStatus ? (
                      <AdminStatusBadge value={campaign.moderationStatus} />
                    ) : null}
                  </div>
                </div>
                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Organizer
                  </p>
                  <p className="mt-2 text-sm font-semibold text-black">
                    {[campaign.organizer?.firstName, campaign.organizer?.lastName]
                      .filter(Boolean)
                      .join(' ') || 'Unknown organizer'}
                  </p>
                  <p className="mt-1 text-sm text-black/65">
                    {campaign.organizer?.email ?? 'No email'}
                  </p>
                  <p className="mt-3 text-xs text-black/55">
                    Last updated context comes from the list endpoint and fundraising analytics
                    snapshot.
                  </p>
                </div>
                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Raised
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-tamiym-blue">
                    {formatAdminCurrency(Number(campaign.currentAmount ?? 0), campaign.currency)}
                  </p>
                  <p className="mt-1 text-sm text-black/55">
                    Goal:{' '}
                    {campaign.goalAmount != null
                      ? formatAdminCurrency(Number(campaign.goalAmount), campaign.currency)
                      : 'Not set'}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Payout policy
                  </p>
                  <p className="mt-2 text-sm font-semibold text-black">
                    {campaign.payoutModeOverride || 'Using site default'}
                  </p>
                  {snapshotQuery.data?.lastPayoutAt ? (
                    <p className="mt-2 text-xs text-black/55">
                      Last payout: {formatAdminDate(snapshotQuery.data.lastPayoutAt)}
                    </p>
                  ) : null}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Fundraising snapshot</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-3">
                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Eligible balance
                  </p>
                  <p className="mt-2 text-xl font-semibold text-tamiym-blue">
                    {formatAdminCurrency(
                      Number(snapshotQuery.data?.eligibleBalance ?? 0),
                      campaign.currency
                    )}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Paid orders
                  </p>
                  <p className="mt-2 text-xl font-semibold text-tamiym-blue">
                    {snapshotQuery.data?.paidOrdersCount ?? 0}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Products in campaign
                  </p>
                  <p className="mt-2 text-xl font-semibold text-tamiym-blue">
                    {campaign.products?.length ?? 0}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Products</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {campaign.products?.length ? (
                  campaign.products.map((entry) => (
                    <div
                      key={entry.id}
                      className="rounded-2xl border border-black/8 bg-[#f7f9fc] px-4 py-3 text-sm font-medium text-black/75"
                    >
                      {entry.product.name}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-black/55">No campaign products were returned.</p>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Review actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <Button
                  className="w-full"
                  disabled={activateMutation.isPending}
                  onClick={() => {
                    setMessage(null);
                    setError(null);
                    activateMutation.mutate();
                  }}
                >
                  {activateMutation.isPending ? 'Activating...' : 'Activate campaign'}
                </Button>

                <div className="space-y-2">
                  <Label htmlFor="rejectionReason">Rejection reason</Label>
                  <Textarea
                    id="rejectionReason"
                    value={rejectionReason}
                    onChange={(event) => setRejectionReason(event.target.value)}
                    placeholder="Reason visible to the organizer"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="rejectionNotes">Internal notes</Label>
                  <Textarea
                    id="rejectionNotes"
                    value={rejectionNotes}
                    onChange={(event) => setRejectionNotes(event.target.value)}
                    placeholder="Optional internal context"
                  />
                </div>
                <Button
                  variant="secondary"
                  className="w-full"
                  disabled={rejectMutation.isPending || !rejectionReason.trim()}
                  onClick={() => {
                    setMessage(null);
                    setError(null);
                    rejectMutation.mutate();
                  }}
                >
                  {rejectMutation.isPending ? 'Rejecting...' : 'Reject campaign'}
                </Button>

                {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
                {error ? <p className="text-sm text-red-700">{error}</p> : null}
              </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Status controls</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="campaignStatus">New status</Label>
                  <select
                    id="campaignStatus"
                    value={selectedStatus}
                    onChange={(event) => setSelectedStatus(event.target.value as CampaignStatus)}
                    className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  className="w-full"
                  onClick={() => {
                    setMessage(null);
                    setError(null);
                    statusMutation.mutate();
                  }}
                  disabled={statusMutation.isPending}
                >
                  {statusMutation.isPending ? 'Updating...' : 'Update campaign status'}
                </Button>

                <div className="space-y-2">
                  <Label htmlFor="payoutPolicy">Payout policy override</Label>
                  <select
                    id="payoutPolicy"
                    value={selectedPayoutPolicy}
                    onChange={(event) => setSelectedPayoutPolicy(event.target.value)}
                    className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
                  >
                    {payoutPolicyOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    setMessage(null);
                    setError(null);
                    payoutPolicyMutation.mutate();
                  }}
                  disabled={payoutPolicyMutation.isPending}
                >
                  {payoutPolicyMutation.isPending ? 'Saving...' : 'Update payout policy'}
                </Button>

                <Link
                  href="/admin/payouts/manual"
                  className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-transparent px-5 text-sm font-medium text-foreground transition-colors hover:bg-primary-50"
                >
                  Open manual payout workspace
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
