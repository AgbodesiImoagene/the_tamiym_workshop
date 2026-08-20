'use client';

import { AdminShell, formatAdminCurrency, formatAdminDate } from '@/components/admin-shell';
import { AdminStatusBadge } from '@/components/admin-status-badge';
import { createAdminRefund, getAdminOrder, updateAdminOrderStatus } from '@/lib/dashboard';
import { OrderStatus } from '@tamiym/types';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Textarea,
} from '@tamiym/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';

const statusOptions = [
  OrderStatus.PROCESSING,
  OrderStatus.FULFILLED,
  OrderStatus.DELIVERED,
  OrderStatus.CANCELLED,
];

export default function AdminOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const orderId = params.id;
  const queryClient = useQueryClient();
  const [selectedStatus, setSelectedStatus] = useState(OrderStatus.PROCESSING);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundIdempotencyKey] = useState(
    () => `admin-refund:${orderId}:${crypto.randomUUID()}`,
  );
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const orderQuery = useQuery({
    queryKey: ['admin-order', orderId],
    queryFn: () => getAdminOrder(orderId),
    enabled: typeof orderId === 'string',
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => updateAdminOrderStatus(orderId, status),
    onSuccess: async () => {
      setMessage('Order status updated.');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-order', orderId] });
      await queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'We could not update the order status.');
      setMessage(null);
    },
  });

  const refundMutation = useMutation({
    mutationFn: (input: { amount: number; reason?: string }) =>
      createAdminRefund(orderId, input.amount, input.reason, refundIdempotencyKey),
    onSuccess: async (result) => {
      const status = result?.status ?? 'INITIATED';
      setMessage(
        status === 'SUCCEEDED'
          ? 'Refund confirmed by provider.'
          : `Refund ${status.toLowerCase().replaceAll('_', ' ')}. Money settles when Paystack confirms.`,
      );
      setError(null);
      setRefundAmount('');
      setRefundReason('');
      await queryClient.invalidateQueries({ queryKey: ['admin-order', orderId] });
      await queryClient.invalidateQueries({ queryKey: ['admin-orders'] });
    },
    onError: (mutationError: Error) => {
      setError(mutationError.message || 'Refund could not be initiated.');
      setMessage(null);
    },
  });

  const order = orderQuery.data;

  return (
    <AdminShell
      activeNav="orders"
      title="Order detail"
      description="Review the full order context before moving status or initiating any refund flow."
    >
      {orderQuery.isLoading ? (
        <p className="text-sm text-black/55">Loading order detail...</p>
      ) : orderQuery.isError || !order ? (
        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardContent className="space-y-4 p-8">
            <h2 className="text-xl font-semibold text-tamiym-blue">Order unavailable</h2>
            <p className="text-sm text-black/65">
              We could not load this order right now. It may not exist or the API request failed.
            </p>
            <Link
              href="/admin/orders"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-medium text-accent-foreground"
            >
              Back to orders
            </Link>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-6">
            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Order summary</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 md:grid-cols-2">
                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Order ID
                  </p>
                  <p className="mt-2 text-sm font-semibold text-tamiym-blue">{order.id}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <AdminStatusBadge value={order.status} />
                    <AdminStatusBadge value={order.paymentStatus} />
                  </div>
                </div>
                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Created
                  </p>
                  <p className="mt-2 text-sm text-black/75">{formatAdminDate(order.createdAt)}</p>
                  <p className="mt-3 text-sm font-semibold text-tamiym-blue">
                    {formatAdminCurrency(Number(order.totalAmount), order.currency)}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Customer
                  </p>
                  <p className="mt-2 text-sm font-semibold text-black">
                    {[order.user.firstName, order.user.lastName].filter(Boolean).join(' ') ||
                      'Unnamed customer'}
                  </p>
                  <p className="mt-1 text-sm text-black/65">{order.user.email}</p>
                </div>
                <div className="rounded-2xl bg-[#f7f9fc] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                    Shipping address
                  </p>
                  {order.shippingAddress ? (
                    <div className="mt-2 space-y-1 text-sm text-black/65">
                      <p className="font-semibold text-black">
                        {order.shippingAddress.recipientName || 'No recipient name'}
                      </p>
                      <p>{order.shippingAddress.addressLine1}</p>
                      {order.shippingAddress.addressLine2 ? (
                        <p>{order.shippingAddress.addressLine2}</p>
                      ) : null}
                      <p>
                        {order.shippingAddress.city}, {order.shippingAddress.state}
                      </p>
                      {order.shippingAddress.phone ? <p>{order.shippingAddress.phone}</p> : null}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-black/55">No shipping address recorded.</p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Items</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {order.items.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-black/8 bg-[#f7f9fc] p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-tamiym-blue">
                          {item.product.name}
                        </p>
                        <p className="text-xs text-black/55">
                          Variant: {item.variant.name} ({item.variant.sku})
                        </p>
                        {item.design ? (
                          <p className="text-xs text-black/55">Design: {item.design.name}</p>
                        ) : null}
                      </div>
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-black/70">
                        Qty {item.quantity}
                      </span>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Refunds</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {(order.refunds ?? []).length === 0 ? (
                  <p className="text-sm text-black/55">No refunds recorded for this order.</p>
                ) : (
                  (order.refunds ?? []).map((refund) => (
                    <div
                      key={refund.id}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-black/8 bg-[#f7f9fc] p-4"
                    >
                      <div className="space-y-1">
                        <AdminStatusBadge value={refund.status} />
                        <p className="text-xs text-black/55">
                          {formatAdminDate(refund.createdAt)}
                          {refund.reason ? ` · ${refund.reason}` : ''}
                        </p>
                      </div>
                      <p className="text-sm font-semibold text-tamiym-blue">
                        {formatAdminCurrency(Number(refund.amount), refund.currency || order.currency)}
                      </p>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Payment and shipping totals</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm text-black/68">
                <div className="flex items-center justify-between rounded-2xl bg-[#f7f9fc] px-4 py-3">
                  <span>Subtotal</span>
                  <span className="font-semibold text-black">
                    {formatAdminCurrency(Number(order.subtotalAmount), order.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-[#f7f9fc] px-4 py-3">
                  <span>Discount</span>
                  <span className="font-semibold text-black">
                    {formatAdminCurrency(Number(order.discountAmount), order.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-[#f7f9fc] px-4 py-3">
                  <span>Shipping fee</span>
                  <span className="font-semibold text-black">
                    {formatAdminCurrency(Number(order.shippingFee), order.currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between rounded-2xl bg-[#f7f9fc] px-4 py-3">
                  <span>Total</span>
                  <span className="font-semibold text-tamiym-blue">
                    {formatAdminCurrency(Number(order.totalAmount), order.currency)}
                  </span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="status">Update status</Label>
                  <select
                    id="status"
                    value={selectedStatus}
                    onChange={(event) => setSelectedStatus(event.target.value as OrderStatus)}
                    className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
                  >
                    {statusOptions.map((status) => (
                      <option key={status} value={status}>
                        {status.replaceAll('_', ' ')}
                      </option>
                    ))}
                  </select>
                  <Button
                    className="w-full"
                    onClick={() => {
                      setMessage(null);
                      setError(null);
                      statusMutation.mutate(selectedStatus);
                    }}
                    disabled={statusMutation.isPending}
                  >
                    {statusMutation.isPending ? 'Updating...' : 'Update order status'}
                  </Button>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="refundAmount">Refund amount</Label>
                  <Input
                    id="refundAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={refundAmount}
                    onChange={(event) => setRefundAmount(event.target.value)}
                    placeholder="Amount in major currency"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="refundReason">Refund reason</Label>
                  <Textarea
                    id="refundReason"
                    value={refundReason}
                    onChange={(event) => setRefundReason(event.target.value)}
                    placeholder="Optional context for this refund"
                  />
                </div>
                <Button
                  variant="secondary"
                  className="w-full"
                  onClick={() => {
                    setMessage(null);
                    setError(null);
                    refundMutation.mutate({
                      amount: Number(refundAmount),
                      reason: refundReason || undefined,
                    });
                  }}
                  disabled={refundMutation.isPending || !refundAmount}
                >
                  {refundMutation.isPending ? 'Submitting...' : 'Initiate refund'}
                </Button>

                {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
                {error ? <p className="text-sm text-red-700">{error}</p> : null}
              </CardContent>
            </Card>

            <Card className="rounded-[1.75rem] border-black/8 shadow-none">
              <CardHeader>
                <CardTitle>Status guide</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm leading-6 text-black/65">
                <p>`PROCESSING` after payment verification and production handoff.</p>
                <p>`FULFILLED` when the order is ready to leave the workshop.</p>
                <p>`DELIVERED` once the shipment has completed.</p>
                <p>`PARTIALLY_REFUNDED` after a provider-confirmed partial refund.</p>
                <p>`REFUNDED` only when confirmed refunds cover the full capture.</p>
                <p>`CANCELLED` is only safe for orders that have not progressed.</p>
              </CardContent>
            </Card>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
