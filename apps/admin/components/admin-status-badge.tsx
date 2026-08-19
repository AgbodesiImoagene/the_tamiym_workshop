'use client';

import { Badge, cn } from '@tamiym/ui';

interface AdminStatusBadgeProps {
  value?: string | null;
}

const toneMap: Record<string, string> = {
  ACTIVE: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  SUCCEEDED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  PAID: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  DELIVERED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  COMPLETED: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  PROCESSING: 'bg-sky-100 text-sky-800 border-sky-200',
  APPROVED: 'bg-sky-100 text-sky-800 border-sky-200',
  QUEUED: 'bg-sky-100 text-sky-800 border-sky-200',
  REVIEW: 'bg-amber-100 text-amber-800 border-amber-200',
  PENDING: 'bg-amber-100 text-amber-800 border-amber-200',
  PENDING_PAYMENT: 'bg-amber-100 text-amber-800 border-amber-200',
  PENDING_APPROVAL: 'bg-amber-100 text-amber-800 border-amber-200',
  INITIATED: 'bg-amber-100 text-amber-800 border-amber-200',
  DRAFT: 'bg-slate-100 text-slate-700 border-slate-200',
  DISABLED: 'bg-slate-100 text-slate-700 border-slate-200',
  PAUSED: 'bg-slate-100 text-slate-700 border-slate-200',
  CANCELLED: 'bg-slate-100 text-slate-700 border-slate-200',
  FULFILLED: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  AUTO_APPROVAL_REQUIRED: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  FAILED: 'bg-red-100 text-red-800 border-red-200',
  REJECTED: 'bg-red-100 text-red-800 border-red-200',
  REFUNDED: 'bg-rose-100 text-rose-800 border-rose-200',
  ENDED: 'bg-violet-100 text-violet-800 border-violet-200',
  EXECUTING: 'bg-violet-100 text-violet-800 border-violet-200',
  MANUAL: 'bg-violet-100 text-violet-800 border-violet-200',
};

export function AdminStatusBadge({ value }: AdminStatusBadgeProps) {
  const normalized = value || 'UNKNOWN';

  return (
    <Badge
      className={cn(
        'border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]',
        toneMap[normalized] || 'border-slate-200 bg-slate-100 text-slate-700'
      )}
    >
      {normalized.replaceAll('_', ' ')}
    </Badge>
  );
}
