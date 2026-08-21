'use client';

import { formatOrderStatusLabel, getOrderStatusPresentation } from '@/lib/order-status';
import { OrderStatus, PaymentStatus } from '@tamiym/types';

const toneClass: Record<string, string> = {
  success: 'bg-emerald-50 text-emerald-900',
  danger: 'bg-red-50 text-red-800',
  warning: 'bg-amber-50 text-amber-900',
  info: 'bg-[#f0f5ff] text-[#004385]',
  neutral: 'bg-black/5 text-black/80',
};

export function OrderStatusBanner({
  paymentStatus,
  orderStatus,
}: {
  paymentStatus?: PaymentStatus;
  orderStatus?: OrderStatus;
}) {
  const copy = getOrderStatusPresentation(paymentStatus, orderStatus);

  return (
    <div className={`space-y-2 rounded-2xl p-4 ${toneClass[copy.tone]}`}>
      <p className="text-sm font-semibold uppercase tracking-[0.14em]">{copy.title}</p>
      <p className="text-sm leading-6">{copy.body}</p>
      <p className="text-xs opacity-80">
        Order {formatOrderStatusLabel(orderStatus ?? 'UNKNOWN')} · Payment{' '}
        {formatOrderStatusLabel(paymentStatus ?? 'UNKNOWN')}
      </p>
    </div>
  );
}
