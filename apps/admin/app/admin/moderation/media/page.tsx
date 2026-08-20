'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminShell } from '@/components/admin-shell';
import { ModerationQueueNav } from '@/components/moderation-queue-nav';
import {
  getAdminMediaAssets,
  moderateMediaAsset,
  MEDIA_STATUS_BADGE,
  bestDerivativeUrl,
  formatBytes,
  type ModerationStatus,
  type AdminMediaAsset,
} from '@/lib/media';
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

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-NG', { dateStyle: 'medium' }).format(new Date(iso));
}

function assetContext(asset: AdminMediaAsset): string {
  if (asset.productImages.length > 0) {
    return `Product: ${asset.productImages[0].product.name}`;
  }
  if (asset.designAssets.length > 0) {
    const u = asset.designAssets[0].owner;
    const name = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
    return `Uploaded by: ${name || u.email}`;
  }
  return 'No linked context';
}

// ─── Quick actions ────────────────────────────────────────────────────────────

function QuickActions({ asset, onDone }: { asset: AdminMediaAsset; onDone: () => void }) {
  const [loading, setLoading] = useState<string | null>(null);

  const act = async (status: 'APPROVED' | 'REJECTED' | 'FLAGGED') => {
    setLoading(status);
    try {
      await moderateMediaAsset(asset.id, status);
      onDone();
    } finally {
      setLoading(null);
    }
  };

  if (asset.moderationStatus === 'APPROVED') {
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
      {asset.moderationStatus !== 'FLAGGED' && (
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
      {asset.moderationStatus !== 'REJECTED' && (
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

// ─── Asset row ────────────────────────────────────────────────────────────────

function AssetRow({ asset, onRefresh }: { asset: AdminMediaAsset; onRefresh: () => void }) {
  const badge = MEDIA_STATUS_BADGE[asset.moderationStatus];
  const thumbUrl =
    bestDerivativeUrl(asset.derivatives) ?? `https://placehold.co/56x56/f3f4f6/9ca3af?text=IMG`;

  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-white px-5 py-4 shadow-xs">
      {/* Thumbnail */}
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-100">
        <img src={thumbUrl} alt="media asset" className="h-full w-full object-cover" />
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href={`/admin/moderation/media/${asset.id}`}
            className="truncate text-sm font-semibold text-foreground hover:underline"
          >
            {asset.originalMime ?? 'Unknown type'}
          </Link>
          <Badge variant={badge.variant}>{badge.label}</Badge>
          {asset.status === 'FAILED' && <Badge variant="danger">Processing failed</Badge>}
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {assetContext(asset)}
          {' · '}
          {formatBytes(asset.originalBytes)}
          {asset.originalWidth && asset.originalHeight
            ? ` · ${asset.originalWidth}×${asset.originalHeight}`
            : ''}
          {' · '}
          {formatDate(asset.createdAt)}
        </p>
        {asset.moderationNotes && (
          <p className="mt-1 truncate text-xs text-amber-700">AI note: {asset.moderationNotes}</p>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <QuickActions asset={asset} onDone={onRefresh} />
        <Link href={`/admin/moderation/media/${asset.id}`}>
          <Button variant="secondary" size="sm">
            Review
          </Button>
        </Link>
      </div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminModerationMediaPage() {
  const [activeFilter, setActiveFilter] = useState<ModerationStatus | undefined>('PENDING');
  const queryClient = useQueryClient();

  const {
    data: assets,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin-media', activeFilter],
    queryFn: () => getAdminMediaAssets(activeFilter),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-media'] });
  };

  const pendingCount = assets?.filter((a) => a.moderationStatus === 'PENDING').length ?? 0;
  const flaggedCount = assets?.filter((a) => a.moderationStatus === 'FLAGGED').length ?? 0;

  return (
    <AdminShell
      activeNav="moderation"
      title="Media moderation"
      description="Review AI-screened image uploads. Assets marked FLAGGED or PENDING need a human decision."
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
                  <span className="rounded-full px-1.5 py-0.5 text-xs font-semibold">{count}</span>
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
            Failed to load media assets. Check your connection.
          </CardContent>
        </Card>
      ) : assets && assets.length > 0 ? (
        <div className="space-y-3">
          {assets.map((a) => (
            <AssetRow key={a.id} asset={a} onRefresh={refresh} />
          ))}
        </div>
      ) : (
        <EmptyState
          title={`No ${activeFilter?.toLowerCase() ?? ''} media assets`}
          description={
            activeFilter === 'PENDING'
              ? 'No assets awaiting review. The AI has processed all uploads.'
              : activeFilter === 'FLAGGED'
                ? 'No flagged assets. Everything looks good.'
                : 'No assets match this filter.'
          }
        />
      )}
    </AdminShell>
  );
}
