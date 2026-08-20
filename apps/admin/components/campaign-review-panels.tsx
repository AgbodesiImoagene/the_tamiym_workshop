'use client';

import Link from 'next/link';
import { Badge, Card, CardContent, CardHeader, CardTitle } from '@tamiym/ui';
import type { AdminCampaignDetail } from '@/lib/dashboard';

const DESIGN_MODERATION_BADGE: Record<
  string,
  { variant: 'brand' | 'accent' | 'neutral' | 'danger'; label: string }
> = {
  PENDING: { variant: 'neutral', label: 'Pending' },
  APPROVED: { variant: 'accent', label: 'Approved' },
  REJECTED: { variant: 'danger', label: 'Rejected' },
  FLAGGED: { variant: 'brand', label: 'Flagged' },
};

export function CampaignReviewDesignsPanel({
  campaign,
  designLinkBase = '/admin/moderation/designs',
}: {
  campaign: AdminCampaignDetail;
  designLinkBase?: string;
}) {
  const allApproved =
    campaign.products.length > 0 &&
    campaign.products.every((p) => !p.design || p.design.moderationStatus === 'APPROVED');
  const hasUnapproved = campaign.products.some(
    (p) => p.design && p.design.moderationStatus !== 'APPROVED'
  );

  return (
    <Card className="rounded-[1.75rem] border-black/8 shadow-none">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Campaign designs</CardTitle>
          {campaign.products.length > 0 ? (
            <Badge variant={allApproved ? 'accent' : hasUnapproved ? 'danger' : 'neutral'}>
              {allApproved
                ? 'All approved'
                : hasUnapproved
                  ? 'Unapproved designs'
                  : 'No designs attached'}
            </Badge>
          ) : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {campaign.products.length === 0 ? (
          <p className="text-sm text-black/55">No products in this campaign.</p>
        ) : (
          campaign.products.map((entry) => {
            const designBadge = entry.design
              ? (DESIGN_MODERATION_BADGE[entry.design.moderationStatus] ?? {
                  variant: 'neutral' as const,
                  label: entry.design.moderationStatus,
                })
              : null;

            return (
              <div
                key={entry.id}
                className="flex items-center gap-4 rounded-2xl border border-black/8 bg-[#f7f9fc] px-4 py-3"
              >
                {entry.design?.thumbnailUrl ? (
                  <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl bg-gray-100">
                    <img
                      src={entry.design.thumbnailUrl}
                      alt={entry.design.name}
                      className="h-full w-full object-cover"
                    />
                  </div>
                ) : (
                  <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gray-200 text-xs text-gray-400">
                    ?
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-black">{entry.product.name}</p>
                  {entry.design ? (
                    <>
                      <p className="mt-0.5 truncate text-xs text-black/55">
                        Design: {entry.design.name}
                      </p>
                      {entry.design.moderationNotes ? (
                        <p className="mt-0.5 truncate text-xs text-amber-700">
                          AI: {entry.design.moderationNotes}
                        </p>
                      ) : null}
                    </>
                  ) : (
                    <p className="mt-0.5 text-xs text-black/40">No design attached</p>
                  )}
                </div>

                {designBadge ? (
                  <Badge variant={designBadge.variant}>{designBadge.label}</Badge>
                ) : null}

                {entry.design ? (
                  <Link
                    href={`${designLinkBase}/${entry.design.id}`}
                    className="shrink-0 text-xs text-primary hover:underline"
                  >
                    Review →
                  </Link>
                ) : null}
              </div>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

export function CampaignReviewContent({ campaign }: { campaign: AdminCampaignDetail }) {
  if (!campaign.description && !campaign.story) return null;

  return (
    <Card className="rounded-[1.75rem] border-black/8 shadow-none">
      <CardHeader>
        <CardTitle>Campaign content</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 text-sm">
        {campaign.description ? (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-black/45">
              Description
            </p>
            <p className="leading-relaxed text-black/75">{campaign.description}</p>
          </div>
        ) : null}
        {campaign.story ? (
          <div>
            <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-black/45">
              Story
            </p>
            <p className="whitespace-pre-wrap leading-relaxed text-black/75">{campaign.story}</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
