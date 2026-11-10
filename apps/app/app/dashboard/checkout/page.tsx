'use client';

import { CustomerDashboardShell, formatCurrency } from '@/components/customer-dashboard-shell';
import { ApiError, User, authApi } from '@/lib/auth';
import {
  type CartItem,
  cartLineKey,
  clearCartIfPendingOrder,
  getCart,
  rotateCartIdempotencyKey,
  setCartPendingOrder,
  useCart,
} from '@/lib/cart-store';
import { createOrder, initiateOrderPayment, quoteOrder, type OrderQuote } from '@/lib/checkout';
import { isShippingNotCovered, SHIPPING_NOT_COVERED_MESSAGE } from '@/lib/checkout-errors';
import { getGeoLgas, getGeoStates, lgaIdPayload } from '@/lib/geo';
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
  stateCode: string;
  lgaId: string;
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
    stateCode: address?.stateCode || '',
    lgaId: address?.lgaId || '',
    postalCode: address?.postalCode || '',
    country: address?.country || 'Nigeria',
  };
}

function toOrderItems(lines: CartItem[]) {
  return lines.map((item) => ({
    variantId: item.variantId,
    ...(item.designId ? { designId: item.designId } : {}),
    quantity: item.quantity,
  }));
}

// Only server state decides: the device clock may be wrong. A pending order whose
// window has passed is reported by initiate-payment as PAYMENT_WINDOW_EXPIRED.
function isOrderClosed(order: { status: string }) {
  return order.status !== 'PENDING_PAYMENT';
}

export default function DashboardCheckoutPage() {
  const router = useRouter();
  const { items, itemCount, subtotal, currency, idempotencyKey, pendingOrderId } = useCart();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [savedAddressId, setSavedAddressId] = useState<string | null>(null);
  // LGA currently saved on the account address (TTW-193): emptying it must be sent as null.
  const [savedLgaId, setSavedLgaId] = useState<string | null>(null);
  const [form, setForm] = useState<CheckoutFormState>(() => addressToForm());
  // Address last saved to the account. Orders are always placed with the saved address,
  // so after a reload it is still the address of any earlier attempt. The API returns
  // the existing order for a known key whatever the payload, so quoting a different
  // address needs a new key (TTW-037).
  const [savedAddressJson, setSavedAddressJson] = useState<string | null>(null);

  // Any new cart revision (lines changed here or in another tab) needs a new quote.
  const [quotedRevision, setQuotedRevision] = useState(idempotencyKey);
  if (quotedRevision !== idempotencyKey) {
    setQuotedRevision(idempotencyKey);
    setQuote(null);
  }

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

  // Prefill the form each time the saved addresses load.
  const [loadedAddresses, setLoadedAddresses] = useState<ShippingAddress[] | undefined>();
  if (loadedAddresses !== addressesQuery.data) {
    setLoadedAddresses(addressesQuery.data);
    const address =
      (addressesQuery.data ?? []).find((item) => item.isDefault) ?? addressesQuery.data?.[0];
    if (address) {
      setSavedAddressId(address.id);
      setSavedLgaId(address.lgaId ?? null);
      setForm(addressToForm(address));
      setSavedAddressJson(JSON.stringify(addressToForm(address)));
    }
  }

  const orderItems = useMemo(() => toOrderItems(items), [items]);

  // TTW-087: the state is chosen from our list. A saved address that has only the
  // state text (no code yet) is matched to the list by name.
  const statesQuery = useQuery({
    queryKey: ['geo-states'],
    queryFn: getGeoStates,
    staleTime: 5 * 60 * 1000,
    enabled: !!user,
  });
  const states = statesQuery.data;
  const selectedState = useMemo(() => {
    if (!states) return undefined;
    if (form.stateCode) return states.find((item) => item.code === form.stateCode);
    const typed = form.state.trim().toLowerCase();
    return typed ? states.find((item) => item.name.toLowerCase() === typed) : undefined;
  }, [states, form.stateCode, form.state]);
  const lgasQuery = useQuery({
    queryKey: ['geo-lgas', selectedState?.code],
    queryFn: () => getGeoLgas(selectedState!.code),
    staleTime: 5 * 60 * 1000,
    enabled: !!selectedState,
  });
  const lgas = lgasQuery.data ?? [];
  const savedStateNotListed = !!states && !selectedState && form.state.trim() !== '';

  // Editing the address invalidates the quote, so the edited address is saved and priced.
  function updateField(field: keyof CheckoutFormState, value: string) {
    setForm((current) => ({ ...current, [field]: value }));
    setQuote(null);
  }

  function selectState(code: string) {
    const next = states?.find((item) => item.code === code);
    setForm((current) => ({
      ...current,
      state: next?.name ?? '',
      stateCode: next?.code ?? '',
      lgaId: '',
    }));
    setQuote(null);
  }

  async function ensureAddress() {
    const address = await upsertPrimaryAddress({
      recipientName: form.recipientName || undefined,
      phone: form.phone || undefined,
      addressLine1: form.addressLine1,
      addressLine2: form.addressLine2 || undefined,
      city: form.city,
      state: selectedState?.name ?? form.state,
      ...(selectedState ? { stateCode: selectedState.code } : {}),
      ...lgaIdPayload(form.lgaId, savedLgaId),
      postalCode: form.postalCode || undefined,
      country: form.country || 'Nigeria',
    });
    setSavedAddressId(address.id);
    setSavedLgaId(address.lgaId ?? null);
    setSavedAddressJson(JSON.stringify(form));
    return address.id;
  }

  async function handleReviewQuote() {
    setError(null);
    setSubmitMessage(null);
    setIsQuoting(true);
    try {
      if (savedAddressJson !== null && savedAddressJson !== JSON.stringify(form)) {
        rotateCartIdempotencyKey();
      }
      const shippingAddressId = await ensureAddress();
      const nextQuote = await quoteOrder({
        shippingAddressId,
        items: orderItems,
      });
      setQuote(nextQuote);
    } catch (err) {
      if (isShippingNotCovered(err)) {
        setQuote(null);
        setError(SHIPPING_NOT_COVERED_MESSAGE);
        return;
      }
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to calculate your quote');
    } finally {
      setIsQuoting(false);
    }
  }

  function startNewRevision(message: string) {
    rotateCartIdempotencyKey();
    setQuote(null);
    setSubmitMessage(message);
  }

  function startNewRevisionAfterExpiry() {
    startNewRevision('Your previous order expired. Review the quote again.');
  }

  async function handlePlaceOrder() {
    const cart = getCart();
    if (!cart) return;
    setError(null);
    setSubmitMessage(null);
    setIsSubmitting(true);
    try {
      const shippingAddressId = savedAddressId || (await ensureAddress());
      // Same cart revision → same key → the API returns the order already created.
      const order = await createOrder({
        shippingAddressId,
        items: toOrderItems(cart.lines),
        idempotencyKey: cart.idempotencyKey,
      });
      // Only the revision this order was created for; another tab may have changed it.
      setCartPendingOrder(order.id, cart.idempotencyKey);

      if (order.paymentStatus === 'SUCCEEDED') {
        // Only the revision this order paid for; a newer cart (other tab) stays.
        clearCartIfPendingOrder(order.id);
        router.push(`/orders/${order.id}/confirm`);
        return;
      }
      if (isOrderClosed(order)) {
        startNewRevisionAfterExpiry();
        return;
      }

      const payment = await initiateOrderPayment(order.id, user?.email);
      // The cart is cleared on the confirmation page once payment is confirmed.
      window.location.assign(payment.authorizationUrl);
    } catch (err) {
      // Nothing was created: the customer corrects the address, the cart stays (TTW-086).
      if (isShippingNotCovered(err)) {
        setQuote(null);
        setSubmitMessage(SHIPPING_NOT_COVERED_MESSAGE);
        return;
      }
      const apiError = err as ApiError;
      if (apiError.code === 'PAYMENT_WINDOW_EXPIRED') {
        startNewRevisionAfterExpiry();
        return;
      }
      // The API refuses a known key sent with other content (TTW-037).
      if (apiError.code === 'IDEMPOTENCY_KEY_PAYLOAD_MISMATCH') {
        startNewRevision('Your cart or address changed. Review the quote again.');
        return;
      }
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
                    onChange={(event) => updateField('recipientName', event.target.value)}
                    className="h-12 w-full rounded-xl border border-black/15 px-4 outline-none"
                    placeholder="Enter recipient name"
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-black">
                  <span>Phone</span>
                  <input
                    value={form.phone}
                    onChange={(event) => updateField('phone', event.target.value)}
                    className="h-12 w-full rounded-xl border border-black/15 px-4 outline-none"
                    placeholder="+234..."
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-black md:col-span-2">
                  <span>Street Address</span>
                  <input
                    value={form.addressLine1}
                    onChange={(event) => updateField('addressLine1', event.target.value)}
                    className="h-12 w-full rounded-xl border border-black/15 px-4 outline-none"
                    placeholder="Enter address"
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-black md:col-span-2">
                  <span>Address Line 2</span>
                  <input
                    value={form.addressLine2}
                    onChange={(event) => updateField('addressLine2', event.target.value)}
                    className="h-12 w-full rounded-xl border border-black/15 px-4 outline-none"
                    placeholder="Apartment, landmark, or suite"
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-black">
                  <span>City</span>
                  <input
                    value={form.city}
                    onChange={(event) => updateField('city', event.target.value)}
                    className="h-12 w-full rounded-xl border border-black/15 px-4 outline-none"
                    placeholder="Enter city"
                  />
                </label>

                <div className="space-y-2 text-sm font-medium text-black">
                  <label htmlFor="checkout-state" className="block">
                    State
                  </label>
                  <select
                    id="checkout-state"
                    value={selectedState?.code ?? ''}
                    onChange={(event) => selectState(event.target.value)}
                    disabled={!states}
                    className="h-12 w-full rounded-xl border border-black/15 bg-white px-4 outline-none"
                  >
                    <option value="">{states ? 'Select a state' : 'Loading states...'}</option>
                    {(states ?? []).map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  {statesQuery.isError ? (
                    <p className="text-xs font-normal text-red-700">
                      We could not load the states.{' '}
                      <button
                        type="button"
                        onClick={() => void statesQuery.refetch()}
                        className="font-semibold underline"
                      >
                        Try again
                      </button>
                    </p>
                  ) : null}
                  {savedStateNotListed ? (
                    <p className="text-xs font-normal text-red-700">
                      Choose a state from the list.
                    </p>
                  ) : null}
                </div>

                <div className="space-y-2 text-sm font-medium text-black">
                  <label htmlFor="checkout-lga" className="block">
                    LGA
                  </label>
                  <select
                    id="checkout-lga"
                    value={form.lgaId}
                    onChange={(event) => updateField('lgaId', event.target.value)}
                    disabled={!selectedState || lgasQuery.isLoading}
                    className="h-12 w-full rounded-xl border border-black/15 bg-white px-4 outline-none"
                  >
                    <option value="">
                      {!selectedState
                        ? 'Select a state first'
                        : lgasQuery.isLoading
                          ? 'Loading LGAs...'
                          : 'Select an LGA (optional)'}
                    </option>
                    {lgas.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                  {lgasQuery.isError ? (
                    <p className="text-xs font-normal text-red-700">
                      We could not load the LGAs.{' '}
                      <button
                        type="button"
                        onClick={() => void lgasQuery.refetch()}
                        className="font-semibold underline"
                      >
                        Try again
                      </button>
                    </p>
                  ) : null}
                </div>

                <label className="space-y-2 text-sm font-medium text-black">
                  <span>Postal Code</span>
                  <input
                    value={form.postalCode}
                    onChange={(event) => updateField('postalCode', event.target.value)}
                    className="h-12 w-full rounded-xl border border-black/15 px-4 outline-none"
                    placeholder="Optional postal code"
                  />
                </label>

                <label className="space-y-2 text-sm font-medium text-black">
                  <span>Country</span>
                  <input
                    value={form.country}
                    onChange={(event) => updateField('country', event.target.value)}
                    className="h-12 w-full rounded-xl border border-black/15 px-4 outline-none"
                    placeholder="Nigeria"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => void handleReviewQuote()}
                  disabled={isQuoting || isSubmitting || !selectedState}
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
                    key={cartLineKey(item)}
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

              {error ? (
                <p role="alert" className="text-sm text-red-700">
                  {error}
                </p>
              ) : null}
              {submitMessage ? (
                <p role="alert" className="text-sm text-red-700">
                  {submitMessage}
                </p>
              ) : null}

              <button
                type="button"
                onClick={() => void handlePlaceOrder()}
                disabled={!quote || isSubmitting || isQuoting}
                className="flex h-12 w-full items-center justify-center rounded-lg bg-[#004385] text-sm font-bold text-white disabled:opacity-60"
              >
                {isSubmitting ? 'Redirecting...' : 'Place order and pay'}
              </button>

              {pendingOrderId ? (
                <Link
                  href={`/orders/${pendingOrderId}/confirm`}
                  className="block text-center text-sm font-semibold text-primary"
                >
                  View pending order
                </Link>
              ) : null}

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
