'use client';

import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, User, authApi } from '@/lib/auth';
import {
  clearCampaignCart,
  loadCampaignCart,
  saveCampaignCart,
  setPendingOrderId,
} from '@/lib/campaign-cart';
import {
  getOwnedOrder,
  initiateOrderPayment,
  type CustomerOrderDetail,
} from '@/lib/campaign-checkout';
import { customerAppPath, webLoginWithNext } from '@/lib/site';
import { OrderStatus, PaymentStatus } from '@tamiym/types';

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency || 'NGN',
  }).format(amount);
}

function getStatusCopy(paymentStatus?: string, orderStatus?: string) {
  if (paymentStatus === PaymentStatus.SUCCEEDED) {
    return {
      title: 'Payment confirmed',
      body: 'Your payment was received. This order is now in fulfillment. Your fundraiser cart has been cleared.',
    };
  }
  if (paymentStatus === PaymentStatus.FAILED) {
    return {
      title: 'Payment failed',
      body: 'The payment attempt did not complete. Your cart is retained so you can retry safely.',
    };
  }
  if (orderStatus === OrderStatus.CANCELLED) {
    return {
      title: 'Order cancelled',
      body: 'This order is no longer active. Your cart was retained unless you discard it from checkout.',
    };
  }
  return {
    title: 'Waiting for payment confirmation',
    body: 'We are polling your owned order status. Paystack redirect query params are display-only and never mark an order paid.',
  };
}

function OrderConfirmContent() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const orderId = typeof params.id === 'string' ? params.id : '';
  const displayReference = searchParams.get('reference');

  const [user, setUser] = useState<User | null>(null);
  const [order, setOrder] = useState<CustomerOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryMessage, setRetryMessage] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  const refreshOrder = useCallback(async () => {
    if (!orderId) return;
    const next = await getOwnedOrder(orderId);
    setOrder(next);
    if (next.paymentStatus === PaymentStatus.SUCCEEDED) {
      clearCampaignCart();
    } else {
      const cart = loadCampaignCart();
      if (cart && cart.pendingOrderId !== next.id) {
        saveCampaignCart(setPendingOrderId(cart, next.id));
      }
    }
    return next;
  }, [orderId]);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const me = await authApi.getMe();
        if (cancelled) return;
        setUser(me);
      } catch (err) {
        const apiError = err as ApiError;
        if (apiError.statusCode === 401) {
          router.replace(webLoginWithNext(`/orders/${orderId}/confirm`));
          return;
        }
        if (!cancelled) setError(apiError.message || 'Failed to load session');
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [orderId, router]);

  useEffect(() => {
    if (!user || !orderId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const next = await refreshOrder();
        if (cancelled || !next) return;
        const pending =
          next.paymentStatus === PaymentStatus.PENDING ||
          next.paymentStatus === PaymentStatus.INITIATED;
        const terminal =
          next.paymentStatus === PaymentStatus.SUCCEEDED ||
          next.paymentStatus === PaymentStatus.FAILED ||
          next.status === OrderStatus.CANCELLED;
        if (pending && !terminal) {
          timer = setTimeout(() => {
            void poll();
          }, 3000);
        }
      } catch (err) {
        if (!cancelled) {
          const apiError = err as ApiError;
          setError(apiError.message || 'We could not load this order.');
        }
      }
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user, orderId, refreshOrder]);

  const statusCopy = useMemo(
    () => getStatusCopy(order?.paymentStatus, order?.status),
    [order?.paymentStatus, order?.status]
  );

  async function handleRetryPayment() {
    if (!order) return;
    setRetryMessage(null);
    setIsRetrying(true);
    try {
      const payment = await initiateOrderPayment(order.id, user?.email);
      window.location.assign(payment.authorizationUrl);
    } catch (err) {
      const apiError = err as ApiError;
      setRetryMessage(apiError.message || 'We could not restart payment for this order.');
    } finally {
      setIsRetrying(false);
    }
  }

  if (error && !user) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center px-6 text-sm text-red-700">
        {error}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-12 lg:px-8">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-black/55">
          Order confirmation
        </p>
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-tamiym-blue">
          {statusCopy.title}
        </h1>
        <p className="text-sm leading-6 text-black/70">{statusCopy.body}</p>
        {displayReference ? (
          <p className="text-xs text-black/55">
            Paystack reference (display only): {displayReference}
          </p>
        ) : null}
      </div>

      {error ? <p className="text-sm text-red-700">{error}</p> : null}

      {!order ? (
        <p className="text-sm text-muted-foreground">Loading order status…</p>
      ) : (
        <section className="space-y-6 rounded-2xl border border-black/10 bg-white p-6">
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase tracking-wide text-black/50">Order</p>
              <p className="mt-1 text-sm font-semibold break-all">{order.id}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-black/50">Payment</p>
              <p className="mt-1 text-sm font-semibold">{order.paymentStatus}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-black/50">Status</p>
              <p className="mt-1 text-sm font-semibold">{order.status}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-black/50">Total</p>
              <p className="mt-1 text-sm font-semibold">
                {formatCurrency(order.totalAmount, order.currency)}
              </p>
            </div>
          </div>

          <div className="space-y-3">
            <h2 className="text-lg font-bold text-black">Items</h2>
            {order.items.map((item) => (
              <div
                key={item.id}
                className="flex items-start justify-between gap-4 rounded-xl border border-black/10 p-4 text-sm"
              >
                <div>
                  <p className="font-semibold">{item.product.name}</p>
                  <p className="text-black/60">{item.variant.name}</p>
                </div>
                <p className="font-semibold">Qty {item.quantity}</p>
              </div>
            ))}
          </div>

          {retryMessage ? <p className="text-sm text-red-700">{retryMessage}</p> : null}

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void refreshOrder()}
              className="inline-flex rounded-lg border border-black/15 px-5 py-3 text-sm font-semibold"
            >
              Refresh status
            </button>
            {order.paymentStatus !== PaymentStatus.SUCCEEDED &&
            order.status !== OrderStatus.CANCELLED ? (
              <button
                type="button"
                onClick={() => void handleRetryPayment()}
                disabled={isRetrying}
                className="inline-flex rounded-lg border border-tamiym-blue px-5 py-3 text-sm font-semibold text-tamiym-blue disabled:opacity-60"
              >
                {isRetrying ? 'Redirecting…' : 'Retry payment'}
              </button>
            ) : null}
            <Link
              href={customerAppPath('/dashboard/orders')}
              className="inline-flex rounded-lg bg-tamiym-blue px-5 py-3 text-sm font-semibold text-white"
            >
              Open account orders
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}

export default function OrderConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
          Loading…
        </div>
      }
    >
      <OrderConfirmContent />
    </Suspense>
  );
}
