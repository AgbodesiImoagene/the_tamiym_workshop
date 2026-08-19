'use client';

import { CustomerDashboardShell, formatCurrency } from '@/components/customer-dashboard-shell';
import { ApiError, User, authApi } from '@/lib/auth';
import { getCustomerOrderDetail, initiateOrderPayment } from '@/lib/checkout';
import { OrderStatus, PaymentStatus } from '@tamiym/types';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

function getStatusCopy(paymentStatus?: PaymentStatus, orderStatus?: OrderStatus) {
  if (paymentStatus === PaymentStatus.SUCCEEDED) {
    return {
      title: 'Payment confirmed',
      body: 'Your payment was received successfully. We have your order and it is now in our fulfillment flow.',
    };
  }

  if (paymentStatus === PaymentStatus.FAILED) {
    return {
      title: 'Payment failed',
      body: 'The payment attempt did not complete. You can retry payment for this order.',
    };
  }

  if (orderStatus === OrderStatus.CANCELLED) {
    return {
      title: 'Order cancelled',
      body: 'This order is no longer active. Create a new order from your cart when you are ready.',
    };
  }

  return {
    title: 'Waiting for payment confirmation',
    body: 'We are still checking the payment status for this order. Paystack and the webhook can take a moment to settle.',
  };
}

export default function OrderConfirmPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
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
    queryKey: ['customer-order-confirm', params.id],
    queryFn: () => getCustomerOrderDetail(params.id),
    enabled: !!user && typeof params.id === 'string',
    refetchInterval: (query) => {
      const paymentStatus = query.state.data?.paymentStatus;
      return paymentStatus === PaymentStatus.PENDING || paymentStatus === PaymentStatus.INITIATED
        ? 3000
        : false;
    },
  });

  const statusCopy = useMemo(
    () => getStatusCopy(orderQuery.data?.paymentStatus, orderQuery.data?.status),
    [orderQuery.data?.paymentStatus, orderQuery.data?.status]
  );

  async function handleRetryPayment() {
    if (!orderQuery.data) {
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

  return (
    <CustomerDashboardShell
      activeNav="orders"
      displayName={user?.firstName || user?.email?.split('@')[0] || 'Borngreat'}
    >
      <div className="mt-10 grid gap-8 lg:mt-0 xl:grid-cols-[minmax(0,1fr)_340px]">
        <section className="space-y-6 rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
          <div className="space-y-2">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-[#004385]">
              Order Confirmation
            </p>
            <h1 className="text-[32px] font-bold tracking-[-0.02em] text-black/90">
              {statusCopy.title}
            </h1>
            <p className="max-w-2xl text-sm leading-6 text-black/70">{statusCopy.body}</p>
            {searchParams.get('reference') ? (
              <p className="text-xs text-black/55">
                Paystack reference: {searchParams.get('reference')}
              </p>
            ) : null}
          </div>

          {orderQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading order details...</p>
          ) : orderQuery.isError ? (
            <p className="text-sm text-red-700">We could not load this order right now.</p>
          ) : orderQuery.data ? (
            <>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                <div className="rounded-2xl bg-[#f8fbff] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
                    Order ID
                  </p>
                  <p className="mt-2 text-sm font-semibold text-black">{orderQuery.data.id}</p>
                </div>
                <div className="rounded-2xl bg-[#f8fbff] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
                    Payment
                  </p>
                  <p className="mt-2 text-sm font-semibold text-black">
                    {orderQuery.data.paymentStatus}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#f8fbff] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
                    Order status
                  </p>
                  <p className="mt-2 text-sm font-semibold text-black">{orderQuery.data.status}</p>
                </div>
                <div className="rounded-2xl bg-[#f8fbff] p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-black/50">
                    Total
                  </p>
                  <p className="mt-2 text-sm font-semibold text-black">
                    {formatCurrency(orderQuery.data.totalAmount, orderQuery.data.currency)}
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <h2 className="text-xl font-bold text-black/90">Items</h2>
                <div className="space-y-3">
                  {orderQuery.data.items.map((item) => (
                    <div
                      key={item.id}
                      className="flex items-start justify-between gap-4 rounded-2xl border border-black/10 p-4"
                    >
                      <div>
                        <p className="font-semibold text-black">{item.product.name}</p>
                        <p className="text-sm text-black/60">{item.variant.name}</p>
                      </div>
                      <p className="text-sm font-semibold text-black">Qty {item.quantity}</p>
                    </div>
                  ))}
                </div>
              </div>

              {retryMessage ? <p className="text-sm text-red-700">{retryMessage}</p> : null}

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/dashboard/orders"
                  className="inline-flex rounded-lg bg-[#004385] px-5 py-3 text-sm font-semibold text-white"
                >
                  View orders
                </Link>
                <button
                  type="button"
                  onClick={() => void orderQuery.refetch()}
                  className="inline-flex rounded-lg border border-black/15 px-5 py-3 text-sm font-semibold text-black"
                >
                  Refresh status
                </button>
                {orderQuery.data.paymentStatus !== PaymentStatus.SUCCEEDED &&
                orderQuery.data.status !== OrderStatus.CANCELLED ? (
                  <button
                    type="button"
                    onClick={() => void handleRetryPayment()}
                    disabled={isRetrying}
                    className="inline-flex rounded-lg border border-[#004385] px-5 py-3 text-sm font-semibold text-[#004385] disabled:opacity-60"
                  >
                    {isRetrying ? 'Redirecting...' : 'Retry payment'}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </section>

        <aside className="h-fit rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
          <div className="space-y-4">
            <h2 className="text-xl font-bold text-black/90">What happens next?</h2>
            <div className="space-y-3 text-sm leading-6 text-black/70">
              <p>1. We verify the Paystack redirect against your real order status.</p>
              <p>2. Successful payments move your order into the production queue.</p>
              <p>3. You can track the latest status anytime from your orders page.</p>
            </div>
          </div>
        </aside>
      </div>
    </CustomerDashboardShell>
  );
}
