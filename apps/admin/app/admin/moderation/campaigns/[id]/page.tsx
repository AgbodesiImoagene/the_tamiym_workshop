'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CampaignStatus } from '@tamiym/types';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
} from '@tamiym/ui';
import { AdminShell, formatAdminCurrency, formatAdminDate } from '@/components/admin-shell';
import {
  CampaignReviewContent,
  CampaignReviewDesignsPanel,
} from '@/components/campaign-review-panels';
import { ModerationQueueNav } from '@/components/moderation-queue-nav';
import { AdminStatusBadge } from '@/components/admin-status-badge';
import {
  activateAdminCampaign,
  getAdminCampaign,
  getAdminCampaignSnapshot,
  rejectAdminCampaign,
  updateAdminCampaignPayoutPolicy,
  updateAdminCampaignStatus,
} from '@/lib/dashboard';

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

export default function AdminModerationCampaignDetailPage() {
  const params = useParams<{ id: string }>();
  const campaignId = params.id;
  const queryClient = useQueryClient();

  const [rejectionReason, setRejectionReason] = useState('');
  const [rejectionNotes, setRejectionNotes] = useState('');
  const [selectedStatus, setSelectedStatus] = useState(CampaignStatus.PAUSED);
  const [selectedPayoutPolicy, setSelectedPayoutPolicy] = useState('keep');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const campaignQuery = useQuery({
    queryKey: ['admin-campaign', campaignId, 'moderation'],
    queryFn: () => getAdminCampaign(campaignId),
  });

  const snapshotQuery = useQuery({
    queryKey: ['admin-campaign-snapshot', campaignId, 'moderation'],
    queryFn: () => getAdminCampaignSnapshot(campaignId),
    enabled: !!campaignId,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['admin-campaign', campaignId] }),
      queryClient.invalidateQueries({ queryKey: ['admin-campaign', campaignId, 'moderation'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-campaigns'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-campaigns', 'moderation'] }),
      queryClient.invalidateQueries({ queryKey: ['admin-campaign-snapshot', campaignId] }),
      queryClient.invalidateQueries({
        queryKey: ['admin-campaign-snapshot', campaignId, 'moderation'],
      }),
    ]);
  };

  const activateMutation = useMutation({
    mutationFn: () => activateAdminCampaign(campaignId),
    onSuccess: async () => {
      setMessage('Campaign activated successfully.');
      setError(null);
      await refresh();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to activate campaign');
      setMessage(null);
    },
  });

  const rejectMutation = useMutation({
    mutationFn: () =>
      rejectAdminCampaign(campaignId, rejectionReason.trim(), rejectionNotes.trim() || undefined),
    onSuccess: async () => {
      setMessage('Campaign rejected and returned to draft.');
      setError(null);
      await refresh();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to reject campaign');
      setMessage(null);
    },
  });

  const statusMutation = useMutation({
    mutationFn: () => updateAdminCampaignStatus(campaignId, selectedStatus),
    onSuccess: async () => {
      setMessage('Campaign status updated.');
      setError(null);
      await refresh();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to update campaign status');
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
      await refresh();
    },
    onError: (err: Error) => {
      setError(err.message || 'Failed to update payout policy');
      setMessage(null);
    },
  });

  const campaign = campaignQuery.data;
  const inReview = campaign?.status === 'REVIEW';

  return (
    <AdminShell
      activeNav="moderation"
      title={campaign ? campaign.title : 'Campaign review'}
      description={
        campaign
          ? `Review fundraiser submission from ${campaign.organizer.email}`
          : 'Campaign moderation detail'
      }
      actions={
        <div className="flex items-center gap-3">
          {campaign?.status ? <AdminStatusBadge value={campaign.status} /> : null}
          {campaign?.moderationStatus ? (
            <AdminStatusBadge value={campaign.moderationStatus} />
          ) : null}
          <Link href="/admin/moderation/campaigns">
            <Button variant="ghost" size="sm">
              ← Queue
            </Button>
          </Link>
        </div>
      }
    >
      <ModerationQueueNav />

      {campaignQuery.isLoading ? (
        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardContent className="space-y-3 py-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-2xl" />
            ))}
          </CardContent>
        </Card>
      ) : campaignQuery.isError || !campaign ? (
        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardContent className="py-16 text-center">
            <p className="text-sm text-red-700">Campaign not found or failed to load.</p>
            <Link href="/admin/moderation/campaigns" className="mt-4 inline-flex">
              <Button variant="secondary">Back to moderation queue</Button>
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
                  {campaign.rejectionReason ? (
                    <p className="mt-2 rounded-lg bg-red-50 p-2 text-xs text-red-700">
                      Rejection: {campaign.rejectionReason}
                    </p>
                  ) : null}
                </div>

                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Organizer
                  </p>
                  <p className="mt-2 text-sm font-semibold text-black">
                    {[campaign.organizer.firstName, campaign.organizer.lastName]
                      .filter(Boolean)
                      .join(' ') || 'Unknown organizer'}
                  </p>
                  <p className="mt-1 text-sm text-black/65">{campaign.organizer.email}</p>
                  <p className="mt-3 text-xs text-black/45">
                    Created {formatAdminDate(campaign.createdAt)}
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
                    Fundraising snapshot
                  </p>
                  {snapshotQuery.isLoading ? (
                    <Skeleton className="mt-2 h-5 w-48 rounded-lg" />
                  ) : snapshotQuery.data ? (
                    <>
                      <p className="mt-2 text-xl font-semibold text-tamiym-blue">
                        {formatAdminCurrency(
                          Number(snapshotQuery.data.eligibleBalance),
                          campaign.currency
                        )}
                      </p>
                      <p className="mt-1 text-xs text-black/55">
                        Eligible balance · {snapshotQuery.data.paidOrdersCount} paid orders
                      </p>
                      {snapshotQuery.data.lastPayoutAt ? (
                        <p className="mt-1 text-xs text-black/45">
                          Last payout: {formatAdminDate(snapshotQuery.data.lastPayoutAt)}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-2 text-sm text-black/45">No snapshot yet</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <CampaignReviewContent campaign={campaign} />
            <CampaignReviewDesignsPanel campaign={campaign} />
          </div>

          <div className="space-y-6">
            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Review actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                {!inReview ? (
                  <p className="rounded-2xl bg-[#f7f9fc] px-4 py-3 text-sm text-black/60">
                    This campaign is currently in `{campaign.status}`. Approval and rejection are
                    only available while a submission is in `REVIEW`.
                  </p>
                ) : null}

                <Button
                  className="w-full"
                  disabled={activateMutation.isPending || !inReview}
                  onClick={() => {
                    setMessage(null);
                    setError(null);
                    activateMutation.mutate();
                  }}
                >
                  {activateMutation.isPending ? 'Activating…' : 'Activate campaign'}
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
                  disabled={rejectMutation.isPending || !inReview || !rejectionReason.trim()}
                  onClick={() => {
                    setMessage(null);
                    setError(null);
                    rejectMutation.mutate();
                  }}
                >
                  {rejectMutation.isPending ? 'Rejecting…' : 'Reject campaign'}
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
                  <Select
                    value={selectedStatus}
                    onValueChange={(val) => setSelectedStatus(val as CampaignStatus)}
                  >
                    <SelectTrigger id="campaignStatus" className="h-11 w-full rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {statusOptions.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status.replaceAll('_', ' ')}
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
                    statusMutation.mutate();
                  }}
                  disabled={statusMutation.isPending}
                >
                  {statusMutation.isPending ? 'Updating…' : 'Update status'}
                </Button>

                <div className="space-y-2">
                  <Label htmlFor="payoutPolicy">Payout policy override</Label>
                  <Select value={selectedPayoutPolicy} onValueChange={setSelectedPayoutPolicy}>
                    <SelectTrigger id="payoutPolicy" className="h-11 w-full rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {payoutPolicyOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  {payoutPolicyMutation.isPending ? 'Saving…' : 'Update payout policy'}
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
