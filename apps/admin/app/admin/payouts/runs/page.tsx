'use client';

import { AdminShell, formatAdminCurrency, formatAdminDate } from '@/components/admin-shell';
import { AdminStatusBadge } from '@/components/admin-status-badge';
import {
  createAdminPayoutRun,
  getAdminPayoutRuns,
  previewAdminPayoutRun,
} from '@/lib/dashboard';
import { Button, Card, CardContent, CardHeader, CardTitle, Input, Label } from '@tamiym/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

const runStatuses = ['ALL', 'DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'EXECUTING', 'COMPLETED', 'CANCELLED'];
const payoutModes = ['MANUAL', 'AUTO_APPROVAL_REQUIRED', 'AUTO_EXECUTE'];

function toDateTimeLocal(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, '0');
  const day = `${value.getDate()}`.padStart(2, '0');
  const hours = `${value.getHours()}`.padStart(2, '0');
  const minutes = `${value.getMinutes()}`.padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
}

export default function AdminPayoutRunsPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const status = searchParams.get('status') ?? 'ALL';
  const [cutoffAt, setCutoffAt] = useState(toDateTimeLocal(new Date()));
  const [scheduledFor, setScheduledFor] = useState(toDateTimeLocal(new Date()));
  const [mode, setMode] = useState('AUTO_APPROVAL_REQUIRED');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runsQuery = useQuery({
    queryKey: ['admin-payout-runs', status],
    queryFn: () => getAdminPayoutRuns(status === 'ALL' ? undefined : status),
  });
  const previewQuery = useQuery({
    queryKey: ['admin-payout-preview', cutoffAt],
    queryFn: () => previewAdminPayoutRun(new Date(cutoffAt).toISOString()),
    enabled: Boolean(cutoffAt),
  });

  const createRunMutation = useMutation({
    mutationFn: () =>
      createAdminPayoutRun({
        scheduledFor: new Date(scheduledFor).toISOString(),
        cutoffAt: new Date(cutoffAt).toISOString(),
        mode,
      }),
    onSuccess: async () => {
      setMessage('Payout run created.');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-payout-runs'] });
      await queryClient.invalidateQueries({ queryKey: ['admin-payout-preview'] });
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Payout run could not be created.');
      setMessage(null);
    },
  });

  function updateStatus(value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || value === 'ALL') {
      next.delete('status');
    } else {
      next.set('status', value);
    }
    router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname);
  }

  return (
    <AdminShell
      activeNav="payouts"
      title="Payout runs"
      description="Review eligible balances, create runs, and move approved batches into execution from one queue-oriented financial workspace."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-6">
          <Card className="rounded-[1.75rem] border-black/8 shadow-none">
            <CardHeader>
              <CardTitle>Run queue</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="max-w-xs space-y-2">
                <Label htmlFor="status">Filter by run status</Label>
                <select
                  id="status"
                  value={status}
                  onChange={(event) => updateStatus(event.target.value)}
                  className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
                >
                  {runStatuses.map((option) => (
                    <option key={option} value={option}>
                      {option.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>

              {runsQuery.isLoading ? (
                <p className="text-sm text-black/55">Loading payout runs...</p>
              ) : runsQuery.isError ? (
                <p className="text-sm text-red-700">We could not load payout runs right now.</p>
              ) : runsQuery.data?.runs.length ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-3">
                    <thead>
                      <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                        <th className="px-4 py-2">Run</th>
                        <th className="px-4 py-2">Schedule</th>
                        <th className="px-4 py-2">Mode</th>
                        <th className="px-4 py-2">Payouts</th>
                        <th className="px-4 py-2">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {runsQuery.data.runs.map((run) => (
                        <tr key={run.id} className="bg-white">
                          <td className="rounded-l-2xl border-y border-l border-black/8 px-4 py-4">
                            <Link
                              href={`/admin/payouts/runs/${run.id}`}
                              className="block text-sm font-semibold text-tamiym-blue"
                            >
                              {run.id}
                            </Link>
                          </td>
                          <td className="border-y border-black/8 px-4 py-4 text-sm text-black/68">
                            <p>{formatAdminDate(run.scheduledFor)}</p>
                            <p className="text-xs text-black/55">
                              Cutoff {formatAdminDate(run.cutoffAt)}
                            </p>
                          </td>
                          <td className="border-y border-black/8 px-4 py-4">
                            <AdminStatusBadge value={run.mode} />
                          </td>
                          <td className="border-y border-black/8 px-4 py-4 text-sm font-medium text-black">
                            {run.payouts.length}
                          </td>
                          <td className="rounded-r-2xl border-y border-r border-black/8 px-4 py-4">
                            <AdminStatusBadge value={run.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-black/55">No payout runs match this filter yet.</p>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-[1.75rem] border-black/8 shadow-none">
            <CardHeader>
              <CardTitle>Create payout run</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="cutoffAt">Cutoff time</Label>
                <Input
                  id="cutoffAt"
                  type="datetime-local"
                  value={cutoffAt}
                  onChange={(event) => setCutoffAt(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="scheduledFor">Scheduled execution</Label>
                <Input
                  id="scheduledFor"
                  type="datetime-local"
                  value={scheduledFor}
                  onChange={(event) => setScheduledFor(event.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="mode">Run mode</Label>
                <select
                  id="mode"
                  value={mode}
                  onChange={(event) => setMode(event.target.value)}
                  className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
                >
                  {payoutModes.map((option) => (
                    <option key={option} value={option}>
                      {option.replaceAll('_', ' ')}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                className="w-full"
                onClick={() => {
                  setMessage(null);
                  setError(null);
                  createRunMutation.mutate();
                }}
                disabled={createRunMutation.isPending}
              >
                {createRunMutation.isPending ? 'Creating...' : 'Create payout run'}
              </Button>
              {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
              {error ? <p className="text-sm text-red-700">{error}</p> : null}
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-black/8 shadow-none">
            <CardHeader>
              <CardTitle>Preview eligible balances</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {previewQuery.isLoading ? (
                <p className="text-sm text-black/55">Loading payout preview...</p>
              ) : previewQuery.isError ? (
                <p className="text-sm text-red-700">We could not load the payout preview right now.</p>
              ) : previewQuery.data ? (
                <>
                  <div className="rounded-2xl bg-[#f7f9fc] p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                      Eligible total
                    </p>
                    <p className="mt-2 text-2xl font-semibold text-tamiym-blue">
                      {formatAdminCurrency(
                        Number(previewQuery.data.totalAmount ?? 0),
                        previewQuery.data.items[0]?.currency ?? 'NGN',
                      )}
                    </p>
                    <p className="mt-2 text-xs text-black/55">
                      Minimum payout amount: {previewQuery.data.minimumPayoutAmount ?? 0}
                    </p>
                  </div>
                  <div className="space-y-3">
                    {previewQuery.data.items.slice(0, 5).map((item) => (
                      <div
                        key={item.campaignId}
                        className="rounded-2xl border border-black/8 bg-[#f7f9fc] px-4 py-3"
                      >
                        <p className="text-sm font-semibold text-tamiym-blue">
                          {item.campaignTitle}
                        </p>
                        <p className="mt-1 text-xs text-black/55">{item.campaignId}</p>
                        <p className="mt-2 text-sm font-medium text-black">
                          {formatAdminCurrency(Number(item.eligibleBalance), item.currency)}
                        </p>
                      </div>
                    ))}
                    {previewQuery.data.items.length > 5 ? (
                      <p className="text-xs text-black/55">
                        Showing 5 of {previewQuery.data.items.length} eligible campaigns.
                      </p>
                    ) : null}
                  </div>
                </>
              ) : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
