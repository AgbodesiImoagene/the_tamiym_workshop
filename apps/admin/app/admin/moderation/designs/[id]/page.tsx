'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminShell } from '@/components/admin-shell';
import { ModerationQueueNav } from '@/components/moderation-queue-nav';
import {
  getAdminDesign,
  moderateDesign,
  MODERATION_STATUS_BADGE,
  MODERATION_STATUS_LABELS,
  type AdminDesignDetail,
} from '@/lib/designs';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle, Skeleton } from '@tamiym/ui';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatOwner(design: AdminDesignDetail) {
  const name = [design.user.firstName, design.user.lastName].filter(Boolean).join(' ').trim();
  return name ? `${name} (${design.user.email})` : design.user.email;
}

function formatDate(iso: string) {
  return new Intl.DateTimeFormat('en-NG', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(new Date(iso));
}

// ─── Moderation action panel ──────────────────────────────────────────────────

function ModerationPanel({ design, onDone }: { design: AdminDesignDetail; onDone: () => void }) {
  const [notes, setNotes] = useState(design.moderationNotes ?? '');
  const [loading, setLoading] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (status: 'APPROVED' | 'REJECTED' | 'FLAGGED') => {
    setLoading(status);
    setError(null);
    setSuccessMsg(null);
    try {
      await moderateDesign(design.id, status, notes.trim() || undefined);
      setSuccessMsg(
        `Design ${status === 'APPROVED' ? 'approved' : status === 'REJECTED' ? 'rejected' : 'flagged'} successfully.`
      );
      onDone();
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message ?? 'Action failed');
    } finally {
      setLoading(null);
    }
  };

  const badge = MODERATION_STATUS_BADGE[design.moderationStatus];

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Moderation decision</CardTitle>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Current status summary */}
        <div className="rounded-xl bg-gray-50 p-4 text-sm">
          <p className="font-medium text-foreground">
            {MODERATION_STATUS_LABELS[design.moderationStatus]}
          </p>
          {design.moderationNotes && (
            <p className="mt-1 text-muted-foreground">{design.moderationNotes}</p>
          )}
        </div>

        {/* Notes textarea */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground">
            Notes (visible to ops, not the user)
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Reason for decision, AI flags, context…"
            className="w-full resize-none rounded-xl border border-border px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </div>

        {/* Feedback */}
        {successMsg && <p className="text-sm font-medium text-green-600">{successMsg}</p>}
        {error && <p className="text-sm text-red-600">{error}</p>}

        {/* Action buttons */}
        <div className="flex flex-wrap gap-2 pt-1">
          {design.moderationStatus !== 'APPROVED' && (
            <Button onClick={() => act('APPROVED')} disabled={loading !== null} variant="default">
              {loading === 'APPROVED' ? 'Approving…' : 'Approve'}
            </Button>
          )}
          {design.moderationStatus !== 'FLAGGED' && (
            <Button onClick={() => act('FLAGGED')} disabled={loading !== null} variant="secondary">
              {loading === 'FLAGGED' ? 'Flagging…' : 'Flag for review'}
            </Button>
          )}
          {design.moderationStatus !== 'REJECTED' && (
            <Button
              onClick={() => act('REJECTED')}
              disabled={loading !== null}
              variant="destructive"
            >
              {loading === 'REJECTED' ? 'Rejecting…' : 'Reject'}
            </Button>
          )}
        </div>

        {design.moderationStatus === 'APPROVED' && (
          <p className="text-xs text-muted-foreground">
            This design is live. Reject or flag it to pull it from active campaigns.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Design data viewer ───────────────────────────────────────────────────────

function DesignDataCard({ design }: { design: AdminDesignDetail }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Design data</CardTitle>
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-xs text-primary hover:underline"
          >
            {expanded ? 'Collapse' : 'Expand'}
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Views */}
        {design.views.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Views
            </p>
            {design.views.map((v) => (
              <div
                key={v.id}
                className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2 text-sm"
              >
                <span className="font-mono text-xs text-muted-foreground">
                  {v.productViewId.slice(-8)}
                </span>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-muted-foreground">
                    {v.layerCount} layer{v.layerCount !== 1 ? 's' : ''}
                  </span>
                  <Badge variant={v.isUsed ? 'accent' : 'neutral'}>
                    {v.isUsed ? 'Used' : 'Empty'}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No view data recorded.</p>
        )}

        {/* Raw JSON (collapsible) */}
        {expanded && (
          <div className="mt-2 space-y-1.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Raw designData
            </p>
            <pre className="max-h-64 overflow-auto rounded-xl bg-gray-900 p-4 text-[11px] leading-relaxed text-gray-100">
              {JSON.stringify(design.designData, null, 2)}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminModerationDesignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const queryClient = useQueryClient();

  const {
    data: design,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin-design', id],
    queryFn: () => getAdminDesign(id),
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-design', id] });
    queryClient.invalidateQueries({ queryKey: ['admin-designs'] });
  };

  const pageTitle = isLoading ? 'Loading…' : (design?.name ?? 'Design not found');
  const badge = design ? MODERATION_STATUS_BADGE[design.moderationStatus] : null;

  return (
    <AdminShell
      activeNav="moderation"
      title={pageTitle}
      description={
        design
          ? `Submitted by ${formatOwner(design)} on ${formatDate(design.createdAt)}`
          : 'Design moderation detail'
      }
      actions={
        <div className="flex items-center gap-3">
          {badge && design && <Badge variant={badge.variant}>{badge.label}</Badge>}
          <Link href="/admin/moderation/designs">
            <Button variant="ghost" size="sm">
              ← Queue
            </Button>
          </Link>
        </div>
      }
    >
      <ModerationQueueNav />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-2xl" />
          ))}
        </div>
      ) : isError || !design ? (
        <div className="py-16 text-center">
          <p className="text-sm text-red-600">Design not found or failed to load.</p>
          <Link href="/admin/moderation/designs">
            <Button variant="secondary" className="mt-4">
              ← Back to queue
            </Button>
          </Link>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
          {/* Left column */}
          <div className="space-y-6">
            {/* Thumbnail */}
            <Card>
              <CardHeader>
                <CardTitle>Preview</CardTitle>
              </CardHeader>
              <CardContent>
                {design.thumbnailUrl ? (
                  <div className="flex justify-center rounded-xl bg-gray-100 p-6">
                    <img
                      src={design.thumbnailUrl}
                      alt={design.name}
                      className="max-h-80 w-auto object-contain"
                    />
                  </div>
                ) : (
                  <div className="flex h-48 items-center justify-center rounded-xl bg-gray-100">
                    <p className="text-sm text-muted-foreground">No thumbnail generated yet</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Design data */}
            <DesignDataCard design={design} />
          </div>

          {/* Right column */}
          <div className="space-y-4">
            {/* Metadata */}
            <Card>
              <CardHeader>
                <CardTitle>Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Design</span>
                  <span className="text-right font-medium text-foreground">{design.name}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Owner</span>
                  <span className="text-right text-foreground">{formatOwner(design)}</span>
                </div>
                {design.product && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Product</span>
                    <Link
                      href={`/admin/catalog/products/${design.product.id}`}
                      className="text-right text-primary hover:underline"
                    >
                      {design.product.name}
                    </Link>
                  </div>
                )}
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Created</span>
                  <span className="text-right text-foreground">{formatDate(design.createdAt)}</span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Last updated</span>
                  <span className="text-right text-foreground">{formatDate(design.updatedAt)}</span>
                </div>
                {design.shareToken && (
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">Share token</span>
                    <code className="text-right font-mono text-xs text-foreground">
                      {design.shareToken}
                    </code>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Moderation action */}
            <ModerationPanel design={design} onDone={refresh} />
          </div>
        </div>
      )}
    </AdminShell>
  );
}
