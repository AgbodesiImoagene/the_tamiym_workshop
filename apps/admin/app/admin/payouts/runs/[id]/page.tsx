'use client';

import { AdminShell, formatAdminCurrency, formatAdminDate } from '@/components/admin-shell';
import { AdminStatusBadge } from '@/components/admin-status-badge';
import {
  approveAdminPayoutRun,
  executeAdminPayoutRun,
  getAdminPayoutRuns,
  retryAdminPayout,
} from '@/lib/dashboard';
import { PayoutStatus } from '@tamiym/types';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@tamiym/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useMemo, useState } from 'react';

export default function AdminPayoutRunDetailPage() {
  const params = useParams<{ id: string }>();
  const runId = params.id;
  const queryClient = useQueryClient();
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runsQuery = useQuery({
    queryKey: ['admin-payout-runs', 'detail-source'],
    queryFn: () => getAdminPayoutRuns(),
  });

  const run = useMemo(
    () => runsQuery.data?.runs.find((entry) => entry.id === runId),
    [runId, runsQuery.data]
  );

  async function refreshRun() {
    await queryClient.invalidateQueries({ queryKey: ['admin-payout-runs'] });
  }

  const approveMutation = useMutation({
    mutationFn: () => approveAdminPayoutRun(runId),
    onSuccess: async () => {
      setMessage('Payout run approved.');
      setError(null);
      await refreshRun();
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Run approval failed.');
      setMessage(null);
    },
  });

  const executeMutation = useMutation({
    mutationFn: () => executeAdminPayoutRun(runId),
    onSuccess: async () => {
      setMessage('Payout run execution started.');
      setError(null);
      await refreshRun();
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Run execution failed.');
      setMessage(null);
    },
  });

  const retryMutation = useMutation({
    mutationFn: (payoutId: string) => retryAdminPayout(payoutId),
    onSuccess: async () => {
      setMessage('Failed payout retried.');
      setError(null);
      await refreshRun();
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Payout retry failed.');
      setMessage(null);
    },
  });

  const totalAmount = run?.payouts.reduce((sum, payout) => sum + Number(payout.amount), 0) ?? 0;

  return (
    <AdminShell
      activeNav="payouts"
      title="Payout run detail"
      description="Run-level approvals and payout retries stay on the detail screen so financial actions happen with clear batch context."
    >
      {runsQuery.isLoading ? (
        <p className="text-sm text-black/55">Loading payout run...</p>
      ) : !run ? (
        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardContent className="space-y-4 p-8">
            <h2 className="text-xl font-semibold text-tamiym-blue">Run unavailable</h2>
            <p className="text-sm text-black/65">
              This payout run was not found in the current admin list response.
            </p>
            <Link
              href="/admin/payouts/runs"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-medium text-accent-foreground"
            >
              Back to payout runs
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Run summary</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Run ID
                  </p>
                  <p className="mt-2 text-sm font-semibold text-tamiym-blue">{run.id}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <AdminStatusBadge value={run.status} />
                    <AdminStatusBadge value={run.mode} />
                  </div>
                </div>
                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Total amount
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-tamiym-blue">
                    {formatAdminCurrency(totalAmount, 'NGN')}
                  </p>
                  <p className="mt-2 text-xs text-black/55">
                    {run.payouts.length} payout(s) in this run
                  </p>
                </div>
                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Scheduled
                  </p>
                  <p className="mt-2 text-sm text-black/70">{formatAdminDate(run.scheduledFor)}</p>
                  <p className="mt-1 text-xs text-black/55">
                    Cutoff {formatAdminDate(run.cutoffAt)}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Lifecycle
                  </p>
                  <p className="mt-2 text-sm text-black/70">
                    Approved {formatAdminDate(run.approvedAt)}
                  </p>
                  <p className="mt-1 text-xs text-black/55">
                    Executed {formatAdminDate(run.executedAt)}
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Payouts in this run</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="min-w-full border-separate border-spacing-y-3">
                    <thead>
                      <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                        <th className="px-4 py-2">Payout</th>
                        <th className="px-4 py-2">Campaign</th>
                        <th className="px-4 py-2">Amount</th>
                        <th className="px-4 py-2">Status</th>
                        <th className="px-4 py-2">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {run.payouts.map((payout) => (
                        <tr key={payout.id} className="bg-white">
                          <td className="rounded-l-2xl border-y border-l border-black/8 px-4 py-4 text-sm font-semibold text-tamiym-blue">
                            {payout.id}
                          </td>
                          <td className="border-y border-black/8 px-4 py-4 text-sm text-black/68">
                            {payout.campaignId}
                            {payout.providerRef ? (
                              <p className="mt-1 text-xs text-black/55">
                                Provider ref: {payout.providerRef}
                              </p>
                            ) : null}
                          </td>
                          <td className="border-y border-black/8 px-4 py-4 text-sm font-semibold text-black">
                            {formatAdminCurrency(Number(payout.amount), 'NGN')}
                          </td>
                          <td className="border-y border-black/8 px-4 py-4">
                            <AdminStatusBadge value={payout.status} />
                          </td>
                          <td className="rounded-r-2xl border-y border-r border-black/8 px-4 py-4">
                            {payout.status === PayoutStatus.FAILED ? (
                              <Button
                                size="sm"
                                variant="secondary"
                                onClick={() => {
                                  setMessage(null);
                                  setError(null);
                                  retryMutation.mutate(payout.id);
                                }}
                                disabled={retryMutation.isPending}
                              >
                                Retry
                              </Button>
                            ) : (
                              <span className="text-xs text-black/45">No action</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Run actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  className="w-full"
                  onClick={() => {
                    setMessage(null);
                    setError(null);
                    approveMutation.mutate();
                  }}
                  disabled={approveMutation.isPending}
                >
                  {approveMutation.isPending ? 'Approving...' : 'Approve run'}
                </Button>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    setMessage(null);
                    setError(null);
                    executeMutation.mutate();
                  }}
                  disabled={executeMutation.isPending}
                >
                  {executeMutation.isPending ? 'Executing...' : 'Execute run'}
                </Button>
                {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
                {error ? <p className="text-sm text-red-700">{error}</p> : null}
              </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Operational notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-black/65">
                <p>Approve the run before execution when your payout mode requires sign-off.</p>
                <p>Retry is only exposed for payouts that have already failed.</p>
                <p>Direct campaign payouts and manual adjustments live in the manual workspace.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
