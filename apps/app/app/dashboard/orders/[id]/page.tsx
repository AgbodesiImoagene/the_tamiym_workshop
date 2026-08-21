'use client';

import { CustomerDashboardShell, formatCurrency } from '@/components/customer-dashboard-shell';
import { OrderStatusBanner } from '@/components/order-status-banner';
import { ApiError, User, authApi } from '@/lib/auth';
import { getCustomerOrderDetail, initiateOrderPayment } from '@/lib/checkout';
import { PaymentStatus } from '@tamiym/types';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function DashboardOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        setUser(await authApi.getMe());
      } catch (err) {
        const apiError = err as ApiError;
        if (apiError.statusCode === 401) {
          router.push('/auth/login');
        } else {
          setError(apiError.message || 'Failed to load user data');
        }
      }
    };

    void fetchUser();
  }, [router]);

  const orderQuery = useQuery({
    queryKey: ['customer-order-detail', params.id],
    queryFn: () => getCustomerOrderDetail(params.id),
    enabled: !!user && typeof params.id === 'string',
    refetchInterval: (query) => {
      const paymentStatus = query.state.data?.paymentStatus;
      return paymentStatus === PaymentStatus.PENDING || paymentStatus === PaymentStatus.INITIATED
        ? 5000
        : false;
    },
  });

  async function handleRetryPayment() {
    if (!orderQuery.data?.paymentRetryEligible) {
      return;
    }

    setRetryMessage(null);
    setIsRetrying(true);
    try {
      const payment = await initiateOrderPayment(orderQuery.data.id, user?.email);
      window.location.assign(payment.authorizationUrl);
    } catch (err) {
      const apiError = err as ApiError;
      setRetryMessage(apiError.message || 'We could not restart payment for this order.');
    } finally {
      setIsRetrying(false);
    }
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  const order = orderQuery.data;

  return (
    <CustomerDashboardShell
      activeNav="orders"
      displayName={user?.firstName || user?.email?.split('@')[0] || 'Borngreat'}
    >
      <div className="mt-10 space-y-6 lg:mt-0">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#004385]">
              Order detail
            </p>
            <h1 className="mt-1 text-[32px] font-bold tracking-[-0.02em] text-black/90">
              {order ? `Order ${order.id.slice(0, 8)}…` : 'Order'}
            </h1>
          </div>
          <Link
            href="/dashboard/orders"
            className="text-sm font-semibold text-[#004385] underline-offset-4 hover:underline"
          >
            Back to orders
          </Link>
        </div>

        {orderQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading order details...</p>
        ) : orderQuery.isError ? (
          <p className="text-sm text-red-700">
            We could not find this order, or you do not have access to it.
          </p>
        ) : order ? (
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="space-y-6 rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
              <OrderStatusBanner paymentStatus={order.paymentStatus} orderStatus={order.status} />

              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-[#f8fbff] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
                    Total
                  </p>
                  <p className="mt-2 text-sm font-semibold text-black">
                    {formatCurrency(order.totalAmount, order.currency)}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#f8fbff] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
                    Subtotal
                  </p>
                  <p className="mt-2 text-sm font-semibold text-black">
                    {formatCurrency(order.subtotalAmount, order.currency)}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#f8fbff] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
                    Shipping
                  </p>
                  <p className="mt-2 text-sm font-semibold text-black">
                    {formatCurrency(order.shippingFee, order.currency)}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#f8fbff] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
                    Refunded
                  </p>
                  <p className="mt-2 text-sm font-semibold text-black">
                    {formatCurrency(order.refundedAmountConfirmed, order.currency)}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <h2 className="text-xl font-bold text-black/90">Items</h2>
                {order.items.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-black/10 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="font-semibold text-black">{item.productNameSnapshot}</p>
                        <p className="text-sm text-black/60">{item.variantDisplaySnapshot}</p>
                        {item.legacySnapshotDisclosure ? (
                          <p className="mt-1 text-xs text-amber-800">
                            Display names were backfilled from the current catalogue and may not
                            match what you originally saw.
                          </p>
                        ) : null}
                      </div>
                      <div className="text-right text-sm">
                        <p className="font-semibold text-black">Qty {item.quantity}</p>
                        <p className="text-black/70">
                          {formatCurrency(item.lineTotal, order.currency)}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="space-y-2">
                <h2 className="text-xl font-bold text-black/90">Shipping destination</h2>
                <p className="text-sm leading-6 text-black/75">
                  {[order.shipping.recipientName, order.shipping.line1, order.shipping.line2]
                    .filter(Boolean)
                    .join(', ')}
                  <br />
                  {[order.shipping.city, order.shipping.state, order.shipping.postalCode]
                    .filter(Boolean)
                    .join(', ')}
                  <br />
                  {order.shipping.country}
                  {order.shipping.phone ? (
                    <>
                      <br />
                      {order.shipping.phone}
                    </>
                  ) : null}
                </p>
              </div>

              {order.campaign ? (
                <div className="rounded-2xl bg-[#f8fbff] p-4 text-sm">
                  <p className="font-semibold text-black">Campaign</p>
                  <p className="mt-1 text-black/70">{order.campaign.title}</p>
                </div>
              ) : null}

              {order.refunds.length > 0 ? (
                <div className="space-y-3">
                  <h2 className="text-xl font-bold text-black/90">Refunds</h2>
                  {order.refunds.map((refund) => (
                    <div
                      key={refund.id}
                      className="flex items-center justify-between rounded-2xl border border-black/10 p-4 text-sm"
                    >
                      <div>
                        <p className="font-semibold">{refund.status.replaceAll('_', ' ')}</p>
                        {refund.reason ? <p className="text-black/60">{refund.reason}</p> : null}
                      </div>
                      <p className="font-semibold">
                        {formatCurrency(refund.amount, refund.currency)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="rounded-2xl border border-dashed border-black/15 bg-[#fafafa] p-4 text-sm text-black/70">
                {order.shipmentPlaceholder}
              </div>

              {retryMessage ? <p className="text-sm text-red-700">{retryMessage}</p> : null}

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void orderQuery.refetch()}
                  className="inline-flex rounded-lg border border-black/15 px-5 py-3 text-sm font-semibold text-black"
                >
                  Refresh
                </button>
                {order.paymentRetryEligible ? (
                  <button
                    type="button"
                    onClick={() => void handleRetryPayment()}
                    disabled={isRetrying}
                    className="inline-flex rounded-lg border border-[#004385] px-5 py-3 text-sm font-semibold text-[#004385] disabled:opacity-60"
                  >
                    {isRetrying ? 'Redirecting...' : 'Retry payment'}
                  </button>
                ) : null}
                <Link
                  href={`/orders/${order.id}/confirm`}
                  className="inline-flex rounded-lg bg-[#004385] px-5 py-3 text-sm font-semibold text-white"
                >
                  Payment confirmation
                </Link>
              </div>
            </section>

            <aside className="h-fit space-y-4 rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
              <h2 className="text-xl font-bold text-black/90">Payment attempts</h2>
              {order.payments.length === 0 ? (
                <p className="text-sm text-black/60">No payment attempts yet.</p>
              ) : (
                <ul className="space-y-3 text-sm">
                  {order.payments.map((payment) => (
                    <li key={payment.id} className="rounded-2xl bg-[#f8fbff] p-3">
                      <p className="font-semibold">{payment.status.replaceAll('_', ' ')}</p>
                      <p className="mt-1 text-black/70">
                        {formatCurrency(payment.amount, payment.currency)}
                      </p>
                      {payment.providerRef ? (
                        <p className="mt-1 text-xs text-black/50">Ref {payment.providerRef}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
              {order.paymentReference ? (
                <p className="text-xs text-black/55">
                  Order payment reference: {order.paymentReference}
                </p>
              ) : null}
            </aside>
          </div>
        ) : null}
      </div>
    </CustomerDashboardShell>
  );
}
