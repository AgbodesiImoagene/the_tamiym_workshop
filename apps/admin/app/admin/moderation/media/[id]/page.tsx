'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminShell } from '@/components/admin-shell';
import { ModerationQueueNav } from '@/components/moderation-queue-nav';
import {
  getAdminMediaAsset,
  moderateMediaAsset,
  MEDIA_STATUS_BADGE,
  bestDerivativeUrl,
  formatBytes,
  type AdminMediaAssetDetail,
} from '@/lib/media';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  Skeleton,
} from '@tamiym/ui';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(iso));
}

// ─── Moderation action panel ──────────────────────────────────────────────────

function ModerationPanel({ asset, onDone }: { asset: AdminMediaAssetDetail; onDone: () => void }) {
  const [notes, setNotes] = useState(asset.moderationNotes ?? '');
  const [loading, setLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (status: 'APPROVED' | 'REJECTED' | 'FLAGGED') => {
    setLoading(status);
    setError(null);
    setSuccessMsg(null);
    try {
      await moderateMediaAsset(asset.id, status, notes.trim() || undefined);
      setSuccessMsg(
        `Asset ${status === 'APPROVED' ? 'approved' : status === 'REJECTED' ? 'rejected' : 'flagged'} successfully.`
      );
      onDone();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message ?? 'Action failed');
    } finally {
      setLoading(null);
    }
  };

  const badge = MEDIA_STATUS_BADGE[asset.moderationStatus];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Moderation decision</CardTitle>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* AI notes */}
        {asset.moderationNotes && (
          <div className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
            <p className="font-medium">AI screening result</p>
            <p className="mt-0.5 text-amber-700">{asset.moderationNotes}</p>
          </div>
        )}

        {/* Notes textarea */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Admin notes (internal only)
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reason for decision, context…"
            className="w-full resize-none rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Feedback */}
        {successMsg && <p className="text-sm font-medium text-green-600">{successMsg}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          {asset.moderationStatus !== 'APPROVED' && (
            <Button onClick={() => act('APPROVED')} disabled={loading !== null} variant="default">
              {loading === 'APPROVED' ? 'Approving…' : 'Approve'}
            </Button>
          )}
          {asset.moderationStatus !== 'FLAGGED' && (
            <Button onClick={() => act('FLAGGED')} disabled={loading !== null} variant="secondary">
              {loading === 'FLAGGED' ? 'Flagging…' : 'Flag for review'}
            </Button>
          )}
          {asset.moderationStatus !== 'REJECTED' && (
            <Button
              onClick={() => act('REJECTED')}
              disabled={loading !== null}
              variant="destructive"
            >
              {loading === 'REJECTED' ? 'Rejecting…' : 'Reject'}
            </Button>
          )}
        </div>

        {asset.moderationStatus === 'APPROVED' && (
          <p className="text-xs text-muted-foreground">
            This asset is cleared for use. Reject or flag it to block further use in designs.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminMediaDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const {
    data: asset,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin-media-asset', id],
    queryFn: () => getAdminMediaAsset(id),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-media-asset', id] });
    queryClient.invalidateQueries({ queryKey: ['admin-media'] });
  };

  const displayUrl = asset ? bestDerivativeUrl(asset.derivatives) : null;
  const badge = asset ? MEDIA_STATUS_BADGE[asset.moderationStatus] : null;

  return (
    <AdminShell
      activeNav="moderation"
      title={isLoading ? 'Loading…' : `Media asset · ${asset?.originalMime ?? 'Unknown'}`}
      description={
        asset ? `Uploaded ${formatDate(asset.createdAt)}` : 'Media asset moderation detail'
      }
      actions={
        <div className="flex items-center gap-3">
          {badge && asset && <Badge variant={badge.variant}>{badge.label}</Badge>}
          {asset?.status === 'FAILED' && <Badge variant="danger">Processing failed</Badge>}
          <Link href="/admin/moderation/media">
            <Button variant="ghost" size="sm">
              ← Queue
            </Button>
          </Link>
        </div>
      }
    >
      <ModerationQueueNav />

      {isLoading ? (
        <div className="space-y-3 py-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-2xl" />
          ))}
        </div>
      ) : isError || !asset ? (
        <div className="py-16 text-center">
          <p className="text-sm text-red-600">Asset not found or failed to load.</p>
          <Link href="/admin/moderation/media">
            <Button variant="secondary" className="mt-4">
              ← Back to queue
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          {/* Left column */}
          <div className="space-y-6">
            {/* Image preview */}
            <Card>
              <CardHeader>
                <CardTitle>Image preview</CardTitle>
              </CardHeader>
              <CardContent>
                {displayUrl ? (
                  <div className="flex justify-center rounded-xl bg-gray-100 p-6">
                    <img
                      src={displayUrl}
                      alt="Media asset"
                      className="max-h-96 w-auto object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex h-48 items-center justify-center rounded-xl bg-gray-100">
                    <p className="text-sm text-muted-foreground">No preview available</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Derivatives */}
            {asset.derivatives.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle>Derivatives</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {asset.derivatives.map((d) => (
                      <div
                        key={d.type}
                        className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"
                      >
                        <span className="font-medium text-foreground">{d.type}</span>
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {d.width && d.height ? (
                            <span>
                              {d.width}×{d.height}
                            </span>
                          ) : null}
                          {d.sizeBytes ? <span>{formatBytes(d.sizeBytes)}</span> : null}
                          <a
                            href={d.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-primary hover:underline"
                          >
                            Open ↗
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Linked context */}
            {(asset.designAssets.length > 0 || asset.productImages.length > 0) && (
              <Card>
                <CardHeader>
                  <CardTitle>Linked to</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {asset.designAssets.map((da) => {
                    const name = [da.owner.firstName, da.owner.lastName]
                      .filter(Boolean)
                      .join(' ')
                      .trim();
                    return (
                      <div
                        key={da.id}
                        className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"
                      >
                        <span className="text-muted-foreground">Design asset</span>
                        <span className="font-medium text-foreground">
                          {name || da.owner.email}
                        </span>
                      </div>
                    );
                  })}
                  {asset.productImages.map((pi) => (
                    <div
                      key={pi.id}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"
                    >
                      <span className="text-muted-foreground">Product image</span>
                      <Link
                        href={`/admin/catalog/products/${pi.product.id}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {pi.product.name}
                      </Link>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Metadata */}
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                {[
                  { label: 'MIME type', value: asset.originalMime ?? '–' },
                  { label: 'Size', value: formatBytes(asset.originalBytes) },
                  {
                    label: 'Dimensions',
                    value:
                      asset.originalWidth && asset.originalHeight
                        ? `${asset.originalWidth}×${asset.originalHeight}`
                        : '–',
                  },
                  { label: 'Processing', value: asset.status },
                  { label: 'Uploaded', value: formatDate(asset.createdAt) },
                  { label: 'Updated', value: formatDate(asset.updatedAt) },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="text-right font-medium text-foreground">{value}</span>
                  </div>
                ))}
              </CardContent>
            </Card>

            {/* Moderation */}
            <ModerationPanel asset={asset} onDone={refresh} />
          </div>
        </div>
      )}
    </AdminShell>
  );
}
