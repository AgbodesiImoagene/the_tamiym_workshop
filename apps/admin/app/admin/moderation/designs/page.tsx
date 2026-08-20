'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminShell } from '@/components/admin-shell';
import { ModerationQueueNav } from '@/components/moderation-queue-nav';
import {
  getAdminDesigns,
  moderateDesign,
  MODERATION_STATUS_BADGE,
  type ModerationStatus,
  type AdminDesign,
} from '@/lib/designs';
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  Skeleton,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@tamiym/ui';

// ─── Filter tabs ──────────────────────────────────────────────────────────────

const FILTERS: { label: string; value: ModerationStatus | undefined }[] = [
  { label: 'All', value: undefined },
  { label: 'Pending', value: 'PENDING' },
  { label: 'Flagged', value: 'FLAGGED' },
  { label: 'Approved', value: 'APPROVED' },
  { label: 'Rejected', value: 'REJECTED' },
];

function formatOwner(design: AdminDesign) {
  const name = [design.user.firstName, design.user.lastName].filter(Boolean).join(' ').trim();
  return name || design.user.email;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'medium',
  }).format(new Date(iso));
}

// ─── Quick-action buttons ─────────────────────────────────────────────────────

function QuickActions({ design, onDone }: { design: AdminDesign; onDone: () => void }) {
  const [loading, setLoading] = useState<string | null>(null);

  const act = async (status: 'APPROVED' | 'REJECTED' | 'FLAGGED') => {
    setLoading(status);
    try {
      await moderateDesign(design.id, status);
      onDone();
    } finally {
      setLoading(null);
    }
  };

  if (design.moderationStatus === 'APPROVED') {
    return (
      <div className="flex gap-2">
        <Button
          size="sm"
          variant="ghost"
          disabled={loading !== null}
          onClick={() => act('FLAGGED')}
        >
          {loading === 'FLAGGED' ? '…' : 'Flag'}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={loading !== null}
          onClick={() => act('REJECTED')}
        >
          {loading === 'REJECTED' ? '…' : 'Reject'}
        </Button>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      {design.moderationStatus !== 'FLAGGED' && (
        <Button
          size="sm"
          variant="ghost"
          disabled={loading !== null}
          onClick={() => act('FLAGGED')}
        >
          {loading === 'FLAGGED' ? '…' : 'Flag'}
        </Button>
      )}
      <Button
        size="sm"
        variant="default"
        disabled={loading !== null}
        onClick={() => act('APPROVED')}
      >
        {loading === 'APPROVED' ? '…' : 'Approve'}
      </Button>
      {design.moderationStatus !== 'REJECTED' && (
        <Button
          size="sm"
          variant="destructive"
          disabled={loading !== null}
          onClick={() => act('REJECTED')}
        >
          {loading === 'REJECTED' ? '…' : 'Reject'}
        </Button>
      )}
    </div>
  );
}

// ─── Design row ───────────────────────────────────────────────────────────────

function DesignRow({ design, onRefresh }: { design: AdminDesign; onRefresh: () => void }) {
  const badge = MODERATION_STATUS_BADGE[design.moderationStatus];
  const thumbUrl =
    design.thumbnailUrl ??
    `https://placehold.co/56x56/f3f4f6/9ca3af?text=${encodeURIComponent(design.name[0] ?? '?')}`;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-white px-5 py-4 shadow-xs">
      {/* Thumbnail */}
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-100">
        <img src={thumbUrl} alt={design.name} className="h-full w-full object-cover" />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/moderation/designs/${design.id}`}
            className="truncate text-sm font-semibold text-foreground hover:underline"
          >
            {design.name}
          </Link>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {formatOwner(design)}
          {design.product ? ` · ${design.product.name}` : ''}
          {' · '}
          {formatDate(design.createdAt)}
        </p>
        {design.moderationNotes && (
          <p className="mt-1 truncate text-xs text-amber-700">AI note: {design.moderationNotes}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <QuickActions design={design} onDone={onRefresh} />
        <Link href={`/admin/moderation/designs/${design.id}`}>
          <Button variant="secondary" size="sm">
            Review
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminModerationDesignsPage() {
  const [activeFilter, setActiveFilter] = useState<ModerationStatus | undefined>('PENDING');
  const queryClient = useQueryClient();

  const {
    data: designs,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin-designs', activeFilter],
    queryFn: () => getAdminDesigns(activeFilter),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-designs'] });
  };

  const pendingCount = designs?.filter((d) => d.moderationStatus === 'PENDING').length ?? 0;
  const flaggedCount = designs?.filter((d) => d.moderationStatus === 'FLAGGED').length ?? 0;

  return (
    <AdminShell
      activeNav="moderation"
      title="Design moderation"
      description="Review AI-screened designs. Approve, reject, or flag for further investigation."
    >
      {/* Queue switcher */}
      <ModerationQueueNav />

      {/* Filter tabs */}
      <Tabs
        value={activeFilter ?? ''}
        onValueChange={(val) => setActiveFilter(val === '' ? undefined : (val as ModerationStatus))}
        className="mb-6"
      >
        <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
          {FILTERS.map((f) => {
            const isFlag = f.value === 'FLAGGED';
            const isPending = f.value === 'PENDING';
            const count = isPending ? pendingCount : isFlag ? flaggedCount : null;
            return (
              <TabsTrigger
                key={String(f.value)}
                value={f.value ?? ''}
                className="h-auto rounded-xl px-4 py-2 text-sm font-medium data-active:bg-primary data-active:text-white data-active:shadow-xs"
              >
                {f.label}
                {count !== null && count > 0 && (
                  <span className="rounded-full px-1.5 py-0.5 text-xs font-semibold data-active:bg-white/20 data-active:text-white">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      {/* Content */}
      {isLoading ? (
        <Card>
          <CardContent className="space-y-3 py-6">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-2xl" />
            ))}
          </CardContent>
        </Card>
      ) : isError ? (
        <Card>
          <CardContent className="py-12 text-center text-sm text-red-600">
            Failed to load designs. Check your connection.
          </CardContent>
        </Card>
      ) : designs && designs.length > 0 ? (
        <div className="space-y-3">
          {designs.map((d) => (
            <DesignRow key={d.id} design={d} onRefresh={refresh} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={`No ${activeFilter?.toLowerCase() ?? ''} designs`}
          description={
            activeFilter === 'PENDING'
              ? 'No designs awaiting review. The AI has processed all submissions.'
              : activeFilter === 'FLAGGED'
                ? 'No flagged designs. Everything looks good.'
                : 'No designs match this filter.'
          }
        />
      )}
    </AdminShell>
  );
}
