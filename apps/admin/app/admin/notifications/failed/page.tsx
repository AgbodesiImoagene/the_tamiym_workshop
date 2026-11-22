'use client';

import { AdminShell, formatAdminDate } from '@/components/admin-shell';
import { AdminStatusBadge } from '@/components/admin-status-badge';
import {
  DEAD_LETTER_BULK_MAX,
  acknowledgeAdminDeadLetter,
  getAdminDeadLetter,
  getAdminDeadLetters,
  replayAdminDeadLetter,
  replayAdminDeadLettersBulk,
  resendBlockedReason,
  type DeadLetterAckStatus,
  type DeadLetterBulkReplayItem,
  type DeadLetterChannel,
  type DeadLetterDetail,
} from '@/lib/notification-dead-letters';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@tamiym/ui';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

const ALL = 'ALL';
const MIN_REASON_LENGTH = 3;

function errorText(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

export default function AdminFailedNotificationsPage() {
  const queryClient = useQueryClient();
  const [channel, setChannel] = useState<string>(ALL);
  const [ackStatus, setAckStatus] = useState<string>(ALL);
  const [eventName, setEventName] = useState('');
  const [appliedEventName, setAppliedEventName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);
  const [bulkReason, setBulkReason] = useState('');
  const [bulkResults, setBulkResults] = useState<DeadLetterBulkReplayItem[] | null>(null);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const filters = {
    channel: channel === ALL ? '' : (channel as DeadLetterChannel),
    ackStatus: ackStatus === ALL ? '' : (ackStatus as DeadLetterAckStatus),
    eventName: appliedEventName,
  } as const;

  const listQuery = useInfiniteQuery({
    queryKey: ['admin-dead-letters', filters],
    queryFn: ({ pageParam }) => getAdminDeadLetters(filters, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
  });
  const items = listQuery.data?.pages.flatMap((page) => page.items) ?? [];

  const refreshAll = async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-dead-letters'] });
    await queryClient.invalidateQueries({ queryKey: ['admin-dead-letter'] });
  };

  const bulkMutation = useMutation({
    mutationFn: () => replayAdminDeadLettersBulk(selectedIds, bulkReason),
    onSuccess: async (data) => {
      setBulkResults(data.results);
      setBulkError(null);
      setSelectedIds([]);
      setBulkReason('');
      await refreshAll();
    },
    onError: async (e: Error) => {
      setBulkError(errorText(e, 'We could not resend the selected failures.'));
      setBulkResults(null);
      await refreshAll();
    },
  });

  const canBulkResend =
    selectedIds.length > 0 &&
    selectedIds.length <= DEAD_LETTER_BULK_MAX &&
    bulkReason.trim().length >= MIN_REASON_LENGTH &&
    !bulkMutation.isPending;

  function toggleSelected(id: string, checked: boolean) {
    setSelectedIds((current) =>
      checked ? [...new Set([...current, id])] : current.filter((value) => value !== id)
    );
  }

  return (
    <AdminShell
      activeNav="notifications"
      title="Failed notifications"
      description="Notifications that could not be delivered. Acknowledge a failure, then resend it."
      actions={
        <Button asChild variant="secondary">
          <Link href="/admin/notifications">Back to notification routes</Link>
        </Button>
      }
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_440px]">
        <Card
          className="rounded-[1.75rem] border-border shadow-none"
          data-testid="dead-letter-list"
        >
          <CardHeader>
            <CardTitle>Failures</CardTitle>
            <CardDescription>
              Recipients and error messages are masked by the API. Only acknowledged failures can be
              resent.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <form
              className="grid gap-4 md:grid-cols-[180px_200px_minmax(0,1fr)_auto]"
              onSubmit={(event) => {
                event.preventDefault();
                setAppliedEventName(eventName.trim());
                setSelectedIds([]);
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="dl-channel">Channel</Label>
                <Select
                  value={channel}
                  onValueChange={(value) => {
                    setChannel(value);
                    setSelectedIds([]);
                  }}
                >
                  <SelectTrigger id="dl-channel" className="h-11 w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All channels</SelectItem>
                    <SelectItem value="EMAIL">Email</SelectItem>
                    <SelectItem value="SMS">SMS</SelectItem>
                    <SelectItem value="SLACK">Slack</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dl-ack">Acknowledgement</Label>
                <Select
                  value={ackStatus}
                  onValueChange={(value) => {
                    setAckStatus(value);
                    setSelectedIds([]);
                  }}
                >
                  <SelectTrigger id="dl-ack" className="h-11 w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={ALL}>All</SelectItem>
                    <SelectItem value="OPEN">Not acknowledged</SelectItem>
                    <SelectItem value="ACKNOWLEDGED">Acknowledged</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="dl-event">Event name</Label>
                <Input
                  id="dl-event"
                  value={eventName}
                  onChange={(event) => setEventName(event.target.value)}
                  placeholder="PaymentConfirmed"
                />
              </div>
              <div className="flex items-end">
                <Button type="submit" variant="secondary" className="h-11">
                  Apply filters
                </Button>
              </div>
            </form>

            <div className="grid gap-3 rounded-2xl border border-border bg-muted/30 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div className="space-y-2">
                <Label htmlFor="dl-bulk-reason">Reason for resending the selected failures</Label>
                <Input
                  id="dl-bulk-reason"
                  value={bulkReason}
                  onChange={(event) => setBulkReason(event.target.value)}
                  placeholder="Provider outage is over"
                />
              </div>
              <Button disabled={!canBulkResend} onClick={() => bulkMutation.mutate()}>
                {bulkMutation.isPending
                  ? 'Resending...'
                  : `Resend selected (${selectedIds.length})`}
              </Button>
              {selectedIds.length > DEAD_LETTER_BULK_MAX ? (
                <p className="text-sm text-destructive md:col-span-2">
                  Select at most {DEAD_LETTER_BULK_MAX} failures at a time.
                </p>
              ) : null}
            </div>

            {bulkError ? (
              <p role="alert" className="text-sm text-destructive">
                {bulkError}
              </p>
            ) : null}
            {bulkResults ? (
              <div
                className="space-y-2 rounded-2xl border border-border p-4"
                data-testid="dead-letter-bulk-results"
              >
                <p className="text-sm font-semibold text-foreground">Resend results</p>
                <ul className="space-y-1 text-sm">
                  {bulkResults.map((result) => (
                    <li
                      key={result.id}
                      className={
                        result.error !== undefined ? 'text-destructive' : 'text-foreground'
                      }
                    >
                      {result.error !== undefined
                        ? `${result.id}: not resent. ${result.error}`
                        : `${result.id}: resent as generation ${result.generation}.`}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {listQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading failed notifications...</p>
            ) : listQuery.isError ? (
              <div role="alert" className="space-y-3">
                <p className="text-sm text-destructive">
                  {errorText(listQuery.error, 'We could not load the failed notifications.')}
                </p>
                <Button variant="secondary" onClick={() => listQuery.refetch()}>
                  Try again
                </Button>
              </div>
            ) : items.length === 0 ? (
              <EmptyState
                title="No failed notifications"
                description="Nothing matches these filters. Failures appear here after delivery gave up."
              />
            ) : (
              <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <span className="sr-only">Select</span>
                      </TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Recipient</TableHead>
                      <TableHead>Attempts</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Failed</TableHead>
                      <TableHead>
                        <span className="sr-only">Actions</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => {
                      const acknowledged = item.deadLetterAckStatus === 'ACKNOWLEDGED';
                      return (
                        <TableRow
                          key={item.id}
                          data-testid="dead-letter-row"
                          data-state={openId === item.id ? 'selected' : undefined}
                        >
                          <TableCell>
                            <Checkbox
                              aria-label={`Select ${item.eventName} to ${item.recipient}`}
                              checked={selectedIds.includes(item.id)}
                              disabled={!acknowledged}
                              onCheckedChange={(checked) =>
                                toggleSelected(item.id, checked === true)
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <p className="font-medium text-foreground">{item.eventName}</p>
                            <p className="text-xs text-muted-foreground">
                              {item.channel} · generation {item.generation}
                            </p>
                          </TableCell>
                          <TableCell className="break-all">{item.recipient}</TableCell>
                          <TableCell>{item.attempts}</TableCell>
                          <TableCell>
                            <AdminStatusBadge
                              value={acknowledged ? 'APPROVED' : 'NEEDS_ATTENTION'}
                            />
                            <p className="mt-1 text-xs text-muted-foreground">
                              {acknowledged ? 'Acknowledged' : 'Not acknowledged'}
                            </p>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {formatAdminDate(item.updatedAt)}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="secondary"
                              size="sm"
                              aria-label={`Open ${item.eventName} to ${item.recipient}`}
                              onClick={() => setOpenId(item.id)}
                            >
                              Open
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
                {listQuery.hasNextPage ? (
                  <Button
                    variant="secondary"
                    disabled={listQuery.isFetchingNextPage}
                    onClick={() => listQuery.fetchNextPage()}
                  >
                    {listQuery.isFetchingNextPage ? 'Loading...' : 'Load more'}
                  </Button>
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <DeadLetterDetailPanel
          key={openId ?? 'none'}
          id={openId}
          onOpen={setOpenId}
          onChanged={refreshAll}
        />
      </div>
    </AdminShell>
  );
}

function DeadLetterDetailPanel({
  id,
  onOpen,
  onChanged,
}: {
  id: string | null;
  onOpen: (id: string) => void;
  onChanged: () => Promise<void>;
}) {
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const detailQuery = useQuery({
    queryKey: ['admin-dead-letter', id],
    queryFn: () => getAdminDeadLetter(id as string),
    enabled: id !== null,
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (current: DeadLetterDetail) => acknowledgeAdminDeadLetter(current.id, note),
    onSuccess: async () => {
      setMessage('Failure acknowledged. You can resend it now.');
      setError(null);
      setNote('');
      await onChanged();
    },
    onError: async (e: Error) => {
      setError(errorText(e, 'We could not acknowledge this failure.'));
      setMessage(null);
      await onChanged();
    },
  });

  const resendMutation = useMutation({
    mutationFn: (current: DeadLetterDetail) => replayAdminDeadLetter(current.id, reason),
    onSuccess: async (result) => {
      setMessage(`Resent as generation ${result.generation}. It is queued for delivery.`);
      setError(null);
      setReason('');
      await onChanged();
    },
    onError: async (e: Error) => {
      setError(errorText(e, 'We could not resend this failure.'));
      setMessage(null);
      // Another admin may have resent it first: show the truth.
      await onChanged();
    },
  });

  if (id === null) {
    return (
      <EmptyState
        title="Select a failure"
        description="Open a failed notification to see its delivery attempts and resend it."
      />
    );
  }

  if (detailQuery.isLoading) {
    return (
      <Card className="rounded-[1.75rem] border-border shadow-none">
        <CardContent className="pt-6 text-sm text-muted-foreground">Loading details...</CardContent>
      </Card>
    );
  }

  if (detailQuery.isError || !detailQuery.data) {
    return (
      <Card className="rounded-[1.75rem] border-border shadow-none" role="alert">
        <CardContent className="space-y-3 pt-6">
          <p className="text-sm text-destructive">
            {errorText(detailQuery.error, 'We could not load this failure.')}
          </p>
          <Button variant="secondary" onClick={() => detailQuery.refetch()}>
            Try again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const detail = detailQuery.data;
  const blockedReason = resendBlockedReason(detail);
  const acknowledged = detail.deadLetterAckStatus === 'ACKNOWLEDGED';
  const canSubmitResend =
    blockedReason === null &&
    reason.trim().length >= MIN_REASON_LENGTH &&
    !resendMutation.isPending;

  return (
    <Card className="rounded-[1.75rem] border-border shadow-none" data-testid="dead-letter-detail">
      <CardHeader>
        <CardTitle>{detail.eventName}</CardTitle>
        <CardDescription>
          {detail.channel} to {detail.recipient} · generation {detail.generation}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-xs text-muted-foreground">Attempts</dt>
            <dd>{detail.attempts}</dd>
          </div>
          <div>
            <dt className="text-xs text-muted-foreground">Last failure</dt>
            <dd>{formatAdminDate(detail.updatedAt)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-xs text-muted-foreground">Last error</dt>
            <dd className="break-words">{detail.lastError ?? 'No error recorded'}</dd>
          </div>
          {acknowledged ? (
            <div className="col-span-2">
              <dt className="text-xs text-muted-foreground">Acknowledged</dt>
              <dd>
                {formatAdminDate(detail.deadLetterAckAt)}
                {detail.deadLetterAckNote ? ` · ${detail.deadLetterAckNote}` : ''}
              </dd>
            </div>
          ) : null}
        </dl>

        <section className="space-y-2" aria-labelledby="dl-attempts-title">
          <h3 id="dl-attempts-title" className="text-sm font-semibold text-foreground">
            Delivery attempts
          </h3>
          {detail.deliveryAttempts.length === 0 ? (
            <p className="text-sm text-muted-foreground">No attempt was recorded.</p>
          ) : (
            <ol className="space-y-2">
              {detail.deliveryAttempts.map((attempt) => (
                <li
                  key={attempt.id}
                  className="rounded-xl border border-border p-3 text-sm"
                  data-testid="dead-letter-attempt"
                >
                  <p className="font-medium text-foreground">
                    Attempt {attempt.attemptNumber} · {attempt.outcome}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatAdminDate(attempt.startedAt)}
                    {attempt.durationMs !== null ? ` · ${attempt.durationMs} ms` : ''}
                  </p>
                  {attempt.errorMessage ? (
                    <p className="mt-1 break-words text-destructive">{attempt.errorMessage}</p>
                  ) : null}
                </li>
              ))}
            </ol>
          )}
        </section>

        <section className="space-y-2" aria-labelledby="dl-payload-title">
          <h3 id="dl-payload-title" className="text-sm font-semibold text-foreground">
            Message data (redacted)
          </h3>
          <pre className="max-h-48 overflow-auto rounded-xl border border-border bg-muted/30 p-3 text-xs">
            {JSON.stringify(detail.payload, null, 2)}
          </pre>
        </section>

        {detail.replayedFrom || detail.replays.length > 0 ? (
          <section className="space-y-2" aria-labelledby="dl-chain-title">
            <h3 id="dl-chain-title" className="text-sm font-semibold text-foreground">
              Resend history
            </h3>
            <ul className="space-y-1 text-sm">
              {detail.replayedFrom ? (
                <li>
                  Resent from generation {detail.replayedFrom.generation} (
                  {detail.replayedFrom.status}
                  ).{' '}
                  <Button
                    variant="link"
                    size="sm"
                    className="h-auto p-0"
                    onClick={() => onOpen(detail.replayedFrom!.id)}
                  >
                    Open it
                  </Button>
                </li>
              ) : null}
              {detail.replays.map((replay) => (
                <li key={replay.id}>
                  Generation {replay.generation}: {replay.status}.{' '}
                  {replay.status === 'FAILED' ? (
                    <Button
                      variant="link"
                      size="sm"
                      className="h-auto p-0"
                      onClick={() => onOpen(replay.id)}
                    >
                      Open it
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {!acknowledged ? (
          <div className="space-y-2">
            <Label htmlFor="dl-note">Note (optional)</Label>
            <Textarea
              id="dl-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What happened, who was told"
            />
            <Button
              disabled={acknowledgeMutation.isPending}
              onClick={() => acknowledgeMutation.mutate(detail)}
            >
              {acknowledgeMutation.isPending ? 'Acknowledging...' : 'Acknowledge failure'}
            </Button>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="dl-reason">Reason for resending</Label>
          <Input
            id="dl-reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Provider outage is over"
            disabled={blockedReason !== null}
          />
          <Button disabled={!canSubmitResend} onClick={() => resendMutation.mutate(detail)}>
            {resendMutation.isPending ? 'Resending...' : 'Resend'}
          </Button>
          {blockedReason ? (
            <p className="text-sm text-muted-foreground" data-testid="dead-letter-resend-hint">
              {blockedReason}
            </p>
          ) : null}
        </div>

        {message ? (
          <p role="status" className="text-sm text-foreground">
            {message}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
