'use client';

import { AdminShell } from '@/components/admin-shell';
import {
  approveAdminManualAdjustment,
  getAdminCampaignsByStatus,
  initiateAdminCampaignPayout,
  requestAdminManualAdjustment,
} from '@/lib/dashboard';
import { CampaignStatus } from '@tamiym/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from '@tamiym/ui';
import { useMutation } from '@tanstack/react-query';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo, useState } from 'react';

export default function AdminManualPayoutsPage() {
  const [campaignId, setCampaignId] = useState('');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [manualCampaignId, setManualCampaignId] = useState('');
  const [manualAmount, setManualAmount] = useState('');
  const [manualReason, setManualReason] = useState('');
  const [manualPayoutId, setManualPayoutId] = useState('');
  const [approvalReason, setApprovalReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const campaignsQuery = useQuery({
    queryKey: ['admin-campaigns', 'payout-workspace'],
    queryFn: () => getAdminCampaignsByStatus(CampaignStatus.ACTIVE),
  });

  const campaignOptions = useMemo(() => campaignsQuery.data ?? [], [campaignsQuery.data]);

  const directPayoutMutation = useMutation({
    mutationFn: () => initiateAdminCampaignPayout(campaignId, Number(amount), reason || undefined),
    onSuccess: () => {
      setMessage('Direct campaign payout initiated.');
      setError(null);
      setAmount('');
      setReason('');
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Direct payout failed.');
      setMessage(null);
    },
  });

  const manualAdjustmentMutation = useMutation({
    mutationFn: () =>
      requestAdminManualAdjustment(manualCampaignId, Number(manualAmount), manualReason),
    onSuccess: () => {
      setMessage('Manual adjustment requested. A second admin must approve it.');
      setError(null);
      setManualAmount('');
      setManualReason('');
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Manual adjustment request failed.');
      setMessage(null);
    },
  });

  const approveManualMutation = useMutation({
    mutationFn: () => approveAdminManualAdjustment(manualPayoutId, approvalReason || undefined),
    onSuccess: () => {
      setMessage('Manual adjustment approved.');
      setError(null);
      setManualPayoutId('');
      setApprovalReason('');
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Manual approval failed.');
      setMessage(null);
    },
  });

  return (
    <AdminShell
      activeNav="payouts"
      title="Manual payouts and adjustments"
      description="Use this workspace for direct campaign payouts, off-ledger adjustments, and second-admin approvals when financial exceptions cannot wait for a batch run."
    >
      <div className="grid gap-6 xl:grid-cols-3">
        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardHeader>
            <CardTitle>Direct campaign payout</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="campaignId">Campaign</Label>
              <select
                id="campaignId"
                value={campaignId}
                onChange={(event) => setCampaignId(event.target.value)}
                className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
              >
                <option value="">Select campaign</option>
                {campaignOptions.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="directAmount">Amount</Label>
              <Input
                id="directAmount"
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="directReason">Reason</Label>
              <Textarea
                id="directReason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Optional payout rationale"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => {
                setMessage(null);
                setError(null);
                directPayoutMutation.mutate();
              }}
              disabled={directPayoutMutation.isPending || !campaignId || !amount}
            >
              {directPayoutMutation.isPending ? 'Submitting...' : 'Initiate payout'}
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardHeader>
            <CardTitle>Request manual adjustment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="manualCampaignId">Campaign</Label>
              <select
                id="manualCampaignId"
                value={manualCampaignId}
                onChange={(event) => setManualCampaignId(event.target.value)}
                className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
              >
                <option value="">Select campaign</option>
                {campaignOptions.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="manualAmount">Amount</Label>
              <Input
                id="manualAmount"
                type="number"
                min="0"
                step="0.01"
                value={manualAmount}
                onChange={(event) => setManualAmount(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="manualReason">Reason</Label>
              <Textarea
                id="manualReason"
                value={manualReason}
                onChange={(event) => setManualReason(event.target.value)}
                placeholder="Required reason for off-ledger adjustment"
              />
            </div>
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => {
                setMessage(null);
                setError(null);
                manualAdjustmentMutation.mutate();
              }}
              disabled={
                manualAdjustmentMutation.isPending ||
                !manualCampaignId ||
                !manualAmount ||
                !manualReason.trim()
              }
            >
              {manualAdjustmentMutation.isPending ? 'Requesting...' : 'Request adjustment'}
            </Button>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardHeader>
            <CardTitle>Approve manual adjustment</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-black/65">
              The API currently approves by payout ID, so use the payout identifier from your
              manual-adjustment workflow or audit trail.
            </p>
            <div className="space-y-2">
              <Label htmlFor="manualPayoutId">Manual payout ID</Label>
              <Input
                id="manualPayoutId"
                value={manualPayoutId}
                onChange={(event) => setManualPayoutId(event.target.value)}
                placeholder="Paste payout id"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="approvalReason">Approver note</Label>
              <Textarea
                id="approvalReason"
                value={approvalReason}
                onChange={(event) => setApprovalReason(event.target.value)}
                placeholder="Optional note from the approving admin"
              />
            </div>
            <Button
              className="w-full"
              onClick={() => {
                setMessage(null);
                setError(null);
                approveManualMutation.mutate();
              }}
              disabled={approveManualMutation.isPending || !manualPayoutId.trim()}
            >
              {approveManualMutation.isPending ? 'Approving...' : 'Approve adjustment'}
            </Button>
            <Link
              href="/admin/payouts/runs"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-transparent px-5 text-sm font-medium text-foreground transition-colors hover:bg-primary-50"
            >
              Back to payout runs
            </Link>
            {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
            {error ? <p className="text-sm text-red-700">{error}</p> : null}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
