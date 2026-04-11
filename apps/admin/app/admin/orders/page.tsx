'use client';

import { AdminShell, formatAdminCurrency, formatAdminDate } from '@/components/admin-shell';
import { AdminStatusBadge } from '@/components/admin-status-badge';
import { getAdminOrdersByStatus } from '@/lib/dashboard';
import { OrderStatus, PaymentStatus } from '@tamiym/types';
import { Card, CardContent, CardHeader, CardTitle, EmptyState, Input, Label } from '@tamiym/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const orderStatusOptions = ['ALL', ...Object.values(OrderStatus)];
const paymentOptions = [
  'ALL',
  'attention',
  ...Object.values(PaymentStatus),
];

export default function AdminOrdersPage() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const status = searchParams.get('status') ?? 'ALL';
  const payment = searchParams.get('payment') ?? 'ALL';
  const query = searchParams.get('q') ?? '';

  const ordersQuery = useQuery({
    queryKey: ['admin-orders', status],
    queryFn: () => getAdminOrdersByStatus(status === 'ALL' ? undefined : status),
  });

  const filteredOrders = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();

    return (ordersQuery.data ?? []).filter((order) => {
      const matchesPayment =
        payment === 'ALL'
          ? true
          : payment === 'attention'
            ? order.paymentStatus !== PaymentStatus.SUCCEEDED
            : order.paymentStatus === payment;
      const matchesQuery = normalizedQuery
        ? [
            order.id,
            order.user.email,
            order.user.firstName ?? '',
            order.user.lastName ?? '',
          ]
            .join(' ')
            .toLowerCase()
            .includes(normalizedQuery)
        : true;

      return matchesPayment && matchesQuery;
    });
  }, [ordersQuery.data, payment, query]);

  function updateFilter(name: string, value: string) {
    const next = new URLSearchParams(searchParams.toString());
    if (!value || value === 'ALL') {
      next.delete(name);
    } else {
      next.set(name, value);
    }
    router.replace(next.toString() ? `${pathname}?${next.toString()}` : pathname);
  }

  return (
    <AdminShell
      activeNav="orders"
      title="Orders workspace"
      description="Filter the order queue by status and payment state, then open each detail view for higher-context actions like status transitions and refunds."
    >
      <div className="space-y-6">
        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardHeader>
            <CardTitle>Filters</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="status">Order status</Label>
              <select
                id="status"
                value={status}
                onChange={(event) => updateFilter('status', event.target.value)}
                className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
              >
                {orderStatusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="payment">Payment status</Label>
              <select
                id="payment"
                value={payment}
                onChange={(event) => updateFilter('payment', event.target.value)}
                className="h-11 w-full rounded-xl border border-black/10 bg-white px-3 text-sm"
              >
                {paymentOptions.map((option) => (
                  <option key={option} value={option}>
                    {option === 'attention' ? 'Needs attention' : option.replaceAll('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="query">Customer or order</Label>
              <Input
                id="query"
                value={query}
                onChange={(event) => updateFilter('q', event.target.value)}
                placeholder="Search by email, name, or order id"
              />
            </div>
          </CardContent>
        </Card>

        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardHeader>
            <CardTitle>Order queue</CardTitle>
          </CardHeader>
          <CardContent>
            {ordersQuery.isLoading ? (
              <p className="text-sm text-black/55">Loading orders...</p>
            ) : ordersQuery.isError ? (
              <p className="text-sm text-red-700">We could not load admin orders right now.</p>
            ) : filteredOrders.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full border-separate border-spacing-y-3">
                  <thead>
                    <tr className="text-left text-xs font-semibold uppercase tracking-[0.18em] text-black/45">
                      <th className="px-4 py-2">Order</th>
                      <th className="px-4 py-2">Customer</th>
                      <th className="px-4 py-2">Created</th>
                      <th className="px-4 py-2">Status</th>
                      <th className="px-4 py-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredOrders.map((order) => (
                      <tr key={order.id} className="bg-white">
                        <td className="rounded-l-2xl border-y border-l border-black/8 px-4 py-4">
                          <Link
                            href={`/admin/orders/${order.id}`}
                            className="block text-sm font-semibold text-tamiym-blue"
                          >
                            {order.id}
                          </Link>
                        </td>
                        <td className="border-y border-black/8 px-4 py-4 text-sm text-black/68">
                          <div>
                            <p className="font-medium text-black">
                              {[order.user.firstName, order.user.lastName]
                                .filter(Boolean)
                                .join(' ') || 'Unnamed customer'}
                            </p>
                            <p className="text-xs text-black/55">{order.user.email}</p>
                          </div>
                        </td>
                        <td className="border-y border-black/8 px-4 py-4 text-sm text-black/68">
                          {formatAdminDate(order.createdAt)}
                        </td>
                        <td className="border-y border-black/8 px-4 py-4">
                          <div className="flex flex-wrap gap-2">
                            <AdminStatusBadge value={order.status} />
                            <AdminStatusBadge value={order.paymentStatus} />
                          </div>
                        </td>
                        <td className="rounded-r-2xl border-y border-r border-black/8 px-4 py-4 text-sm font-semibold text-black">
                          {formatAdminCurrency(Number(order.totalAmount), order.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState
                title="No orders match these filters"
                description="Try broadening the filters or clear the search to reopen the full queue."
              />
            )}
          </CardContent>
        </Card>
      </div>
    </AdminShell>
  );
}
