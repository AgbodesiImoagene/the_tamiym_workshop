'use client';

import { CustomerDashboardShell, formatCurrency } from '@/components/customer-dashboard-shell';
import { ApiError, User, authApi } from '@/lib/auth';
import { clearCart, useCart } from '@/lib/cart-store';
import { createOrder, initiateOrderPayment, quoteOrder, type OrderQuote } from '@/lib/checkout';
import { getUserAddresses, type ShippingAddress, upsertPrimaryAddress } from '@/lib/profile';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

interface CheckoutFormState {
  recipientName: string;
  phone: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

function addressToForm(address?: ShippingAddress | null): CheckoutFormState {
  return {
    recipientName: address?.recipientName || '',
    phone: address?.phone || '',
    addressLine1: address?.addressLine1 || '',
    addressLine2: address?.addressLine2 || '',
    city: address?.city || '',
    state: address?.state || '',
    postalCode: address?.postalCode || '',
    country: address?.country || 'Nigeria',
  };
}

export default function DashboardCheckoutPage() {
  const router = useRouter();
  const { items, itemCount, subtotal, currency } = useCart();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [savedAddressId, setSavedAddressId] = useState<string | null>(null);
  const [form, setForm] = useState<CheckoutFormState>(() => addressToForm());

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

  const addressesQuery = useQuery({
    queryKey: ['checkout-addresses'],
    queryFn: getUserAddresses,
    enabled: !!user,
  });

  useEffect(() => {
    const address =
      (addressesQuery.data ?? []).find((item) => item.isDefault) ?? addressesQuery.data?.[0];
    if (address) {
      setSavedAddressId(address.id);
      setForm(addressToForm(address));
    }
  }, [addressesQuery.data]);

  const orderItems = useMemo(
    () =>
      items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      })),
    [items]
  );

  async function ensureAddress() {
    const address = await upsertPrimaryAddress({
      recipientName: form.recipientName || undefined,
      phone: form.phone || undefined,
      addressLine1: form.addressLine1,
      addressLine2: form.addressLine2 || undefined,
      city: form.city,
      state: form.state,
      postalCode: form.postalCode || undefined,
      country: form.country || 'Nigeria',
    });
    setSavedAddressId(address.id);
    return address.id;
  }

  async function handleReviewQuote() {
    setError(null);
    setSubmitMessage(null);
    setIsQuoting(true);
    try {
      const shippingAddressId = await ensureAddress();
      const nextQuote = await quoteOrder({
        shippingAddressId,
        items: orderItems,
      });
      setQuote(nextQuote);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to calculate your quote');
    } finally {
      setIsQuoting(false);
    }
  }

  async function handlePlaceOrder() {
    setError(null);
    setSubmitMessage(null);
    setIsSubmitting(true);
    try {
      const shippingAddressId = savedAddressId || (await ensureAddress());
      const createdOrder = await createOrder({
        shippingAddressId,
        items: orderItems,
        idempotencyKey: crypto.randomUUID(),
      });
      const payment = await initiateOrderPayment(createdOrder.id, user?.email);
      clearCart();
      window.location.assign(payment.authorizationUrl);
    } catch (err) {
      const apiError = err as ApiError;
      setSubmitMessage(apiError.message || 'We could not initiate your payment.');
    } finally {
      setIsSubmitting(false);
    }
  }

  if (error && !user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <CustomerDashboardShell
      activeNav="cart"
      displayName={user?.firstName || user?.email?.split('@')[0] || 'Borngreat'}
    >
      <div className="mt-10 space-y-8 lg:mt-0">
        <div className="space-y-2">
          <h1 className="text-[32px] font-bold tracking-[-0.02em] text-black/90">Checkout</h1>
          <p className="text-sm text-black/70">
            Confirm your delivery address, review the quote, and continue to Paystack.
          </p>
        </div>

        {items.length === 0 ? (
          <div className="rounded-[28px] border border-dashed border-black/20 bg-[#f8fbff] px-6 py-8">
            <p className="text-sm text-black/70">
              Your cart is empty. Add products before starting checkout.
            </p>
            <Link
              href="/dashboard/products"
              className="mt-4 inline-flex rounded-lg bg-[#004385] px-5 py-3 text-sm font-semibold text-white"
            >
              Browse products
            </Link>
          </div>
        ) : (
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_360px]">
            <section className="space-y-8 rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-black/90">Delivery Address</h2>
                <p className="text-sm text-black/65">
                  We will save this as your primary shipping address for pricing and delivery.
                </p>
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="space-y-2 text-sm font-medium text-black">
                  <span>Recipient Name</span>
                  <input
                    value={form.recipientName}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, recipientName: event.target.value }))
                    }
                    className="h-12 w-full rounded-xl border border-black/15 px-4 outline-none"
                    placeholder="Enter recipient name"
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-black">
                  <span>Phone</span>
                  <input
                    value={form.phone}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, phone: event.target.value }))
                    }
                    className="h-12 w-full rounded-xl border border-black/15 px-4 outline-none"
                    placeholder="+234..."
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-black md:col-span-2">
                  <span>Street Address</span>
                  <input
                    value={form.addressLine1}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, addressLine1: event.target.value }))
                    }
                    className="h-12 w-full rounded-xl border border-black/15 px-4 outline-none"
                    placeholder="Enter address"
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-black md:col-span-2">
                  <span>Address Line 2</span>
                  <input
                    value={form.addressLine2}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, addressLine2: event.target.value }))
                    }
                    className="h-12 w-full rounded-xl border border-black/15 px-4 outline-none"
                    placeholder="Apartment, landmark, or suite"
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-black">
                  <span>City</span>
                  <input
                    value={form.city}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, city: event.target.value }))
                    }
                    className="h-12 w-full rounded-xl border border-black/15 px-4 outline-none"
                    placeholder="Enter city"
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-black">
                  <span>State</span>
                  <input
                    value={form.state}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, state: event.target.value }))
                    }
                    className="h-12 w-full rounded-xl border border-black/15 px-4 outline-none"
                    placeholder="Enter state"
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-black">
                  <span>Postal Code</span>
                  <input
                    value={form.postalCode}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, postalCode: event.target.value }))
                    }
                    className="h-12 w-full rounded-xl border border-black/15 px-4 outline-none"
                    placeholder="Optional postal code"
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-black">
                  <span>Country</span>
                  <input
                    value={form.country}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, country: event.target.value }))
                    }
                    className="h-12 w-full rounded-xl border border-black/15 px-4 outline-none"
                    placeholder="Nigeria"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleReviewQuote()}
                  disabled={isQuoting || isSubmitting}
                  className="inline-flex h-12 items-center justify-center rounded-lg border border-[#004385] px-5 text-sm font-bold text-[#004385] disabled:opacity-60"
                >
                  {isQuoting ? 'Reviewing...' : 'Review quote'}
                </button>
                {addressesQuery.data?.length ? (
                  <p className="text-xs text-black/55">
                    {addressesQuery.data.length} saved address(es) found. The default address has
                    been loaded.
                  </p>
                ) : null}
              </div>
            </section>

            <aside className="space-y-6 rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
              <div className="space-y-1">
                <h2 className="text-2xl font-bold text-black/90">Order Summary</h2>
                <p className="text-sm text-black/65">{itemCount} item(s) in this order</p>
              </div>

              <div className="space-y-4">
                {items.map((item) => (
                  <div
                    key={item.variantId}
                    className="flex items-start justify-between gap-4 text-sm"
                  >
                    <div>
                      <p className="font-semibold text-black">{item.productName}</p>
                      <p className="text-black/60">
                        {item.variantName} x {item.quantity}
                      </p>
                    </div>
                    <span className="font-semibold text-black">
                      {formatCurrency(item.unitPrice * item.quantity, item.currency)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="space-y-3 border-t border-black/10 pt-4 text-sm">
                <div className="flex items-center justify-between">
                  <span className="text-black/70">Items subtotal</span>
                  <span className="font-semibold text-black">
                    {formatCurrency(subtotal, currency)}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-black/70">Shipping</span>
                  <span className="font-semibold text-black">
                    {quote ? formatCurrency(quote.shippingFee, quote.currency) : 'Quote first'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-black/70">VAT</span>
                  <span className="font-semibold text-black">
                    {quote ? formatCurrency(quote.vatAmount, quote.currency) : 'Quote first'}
                  </span>
                </div>
                <div className="flex items-center justify-between border-t border-black/10 pt-3">
                  <span className="font-semibold text-black">Total</span>
                  <span className="text-lg font-bold text-black">
                    {quote
                      ? formatCurrency(quote.totalAmount, quote.currency)
                      : formatCurrency(subtotal, currency)}
                  </span>
                </div>
              </div>

              {error ? <p className="text-sm text-red-700">{error}</p> : null}
              {submitMessage ? <p className="text-sm text-red-700">{submitMessage}</p> : null}

              <button
                type="button"
                onClick={() => void handlePlaceOrder()}
                disabled={!quote || isSubmitting || isQuoting}
                className="flex h-12 w-full items-center justify-center rounded-lg bg-[#004385] text-sm font-bold text-white disabled:opacity-60"
              >
                {isSubmitting ? 'Redirecting...' : 'Place order and pay'}
              </button>

              <p className="text-xs leading-5 text-black/55">
                After you place the order we will redirect you to Paystack to complete payment. You
                will return to your order confirmation page afterwards.
              </p>
            </aside>
          </div>
        )}
      </div>
    </CustomerDashboardShell>
  );
}
