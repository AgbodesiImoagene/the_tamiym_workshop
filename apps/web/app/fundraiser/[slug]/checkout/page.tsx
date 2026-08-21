'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ApiError, User, authApi } from '@/lib/auth';
import { getUserAddresses, upsertPrimaryAddress, type ShippingAddress } from '@/lib/addresses';
import {
  clearCampaignCart,
  loadCampaignCart,
  saveCampaignCart,
  setPendingOrderId,
  type CampaignCart,
} from '@/lib/campaign-cart';
import {
  cartLinesToQuoteItems,
  createCampaignOrder,
  initiateOrderPayment,
  quoteCampaignOrder,
  type CampaignOrderQuote,
} from '@/lib/campaign-checkout';
import { getPublicFundraiser } from '@/lib/fundraisers';
import { webLoginWithNext, webRegisterWithNext } from '@/lib/site';

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

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency: currency || 'NGN',
  }).format(amount);
}

export default function FundraiserCheckoutPage() {
  const params = useParams<{ slug: string }>();
  const router = useRouter();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const checkoutPath = `/fundraiser/${slug}/checkout`;

  const [user, setUser] = useState<User | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [cart, setCart] = useState<CampaignCart | null>(null);
  const [campaignTitle, setCampaignTitle] = useState<string | null>(null);
  const [campaignMismatch, setCampaignMismatch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quote, setQuote] = useState<CampaignOrderQuote | null>(null);
  const [quoteAccepted, setQuoteAccepted] = useState(false);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [form, setForm] = useState<CheckoutFormState>(() => addressToForm());

  const hydrateCart = useCallback(() => {
    const loaded = loadCampaignCart();
    setCart(loaded);
    return loaded;
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        const me = await authApi.getMe();
        if (cancelled) return;
        setUser(me);
        if (!me.emailVerified) {
          router.replace(`/auth/verify?next=${encodeURIComponent(checkoutPath)}`);
          return;
        }
      } catch (err) {
        const apiError = err as ApiError;
        if (apiError.statusCode === 401) {
          router.replace(webLoginWithNext(checkoutPath));
          return;
        }
        if (!cancelled) {
          setError(apiError.message || 'Failed to load your session');
        }
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    }
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, [checkoutPath, router]);

  useEffect(() => {
    if (!authChecked || !user) return;
    const loaded = hydrateCart();
    if (!loaded || loaded.lines.length === 0) {
      setError('Your cart is empty. Choose a product on the fundraiser page first.');
      return;
    }

    let cancelled = false;
    async function matchCampaign() {
      try {
        const fundraiser = await getPublicFundraiser(slug);
        if (cancelled) return;
        if (!fundraiser) {
          setError('We could not load this fundraiser right now.');
          return;
        }
        setCampaignTitle(fundraiser.title);
        if (fundraiser.id !== loaded!.campaignId) {
          setCampaignMismatch(true);
          setError('This checkout page does not match the campaign in your cart.');
        }
      } catch {
        if (!cancelled) {
          setError('We could not load this fundraiser right now.');
        }
      }
    }
    void matchCampaign();

    void (async () => {
      try {
        const addresses = await getUserAddresses();
        if (cancelled) return;
        const address = addresses.find((item) => item.isDefault) ?? addresses[0];
        if (address) {
          setForm(addressToForm(address));
        }
      } catch {
        // Address form stays blank; user can create one.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authChecked, user, slug, hydrateCart]);

  const lineCount = useMemo(
    () => cart?.lines.reduce((sum, line) => sum + line.quantity, 0) ?? 0,
    [cart]
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
    return address.id;
  }

  async function handleReviewQuote() {
    if (!cart) return;
    setError(null);
    setQuoteAccepted(false);
    setIsQuoting(true);
    try {
      const shippingAddressId = await ensureAddress();
      const nextQuote = await quoteCampaignOrder(cart.campaignId, {
        shippingAddressId,
        items: cartLinesToQuoteItems(cart.lines),
      });
      setQuote(nextQuote);
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.code === 'EMAIL_NOT_VERIFIED') {
        router.replace(`/auth/verify?next=${encodeURIComponent(checkoutPath)}`);
        return;
      }
      setError(apiError.message || 'Failed to calculate your quote');
    } finally {
      setIsQuoting(false);
    }
  }

  async function handlePlaceOrder() {
    if (!cart || !quote || !quoteAccepted) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const shippingAddressId = await ensureAddress();
      const createdOrder = await createCampaignOrder(cart.campaignId, {
        shippingAddressId,
        items: cartLinesToQuoteItems(cart.lines),
        idempotencyKey: cart.idempotencyKey,
      });
      const withPending = setPendingOrderId(cart, createdOrder.id);
      saveCampaignCart(withPending);
      setCart(withPending);

      const payment = await initiateOrderPayment(createdOrder.id, user?.email);
      window.location.assign(payment.authorizationUrl);
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.code === 'EMAIL_NOT_VERIFIED') {
        router.replace(`/auth/verify?next=${encodeURIComponent(checkoutPath)}`);
        return;
      }
      setError(apiError.message || 'We could not start payment for this order.');
    } finally {
      setIsSubmitting(false);
    }
  }

  function handleDiscardCart() {
    clearCampaignCart();
    setCart(null);
    setQuote(null);
    router.push(`/fundraiser/${slug}`);
  }

  if (!authChecked) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Checking your session…
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-8 px-6 py-12 lg:px-8">
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-wide text-black/55">
          Fundraiser checkout
        </p>
        <h1 className="text-3xl font-bold tracking-[-0.02em] text-tamiym-blue">
          {campaignTitle || 'Complete your order'}
        </h1>
        <p className="text-sm text-black/70">
          Review shipping, accept the authoritative quote, then continue to Paystack. Prices in your
          browser cart are never trusted for settlement.
        </p>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {!cart || cart.lines.length === 0 || campaignMismatch ? (
        <div className="space-y-4 rounded-2xl border border-dashed border-black/20 bg-white p-6">
          <p className="text-sm text-black/70">
            {campaignMismatch
              ? 'Open the fundraiser that matches your cart, or discard the cart and start again.'
              : 'Add a product from the fundraiser page before checking out.'}
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/fundraiser/${slug}`}
              className="inline-flex rounded-lg bg-tamiym-blue px-5 py-3 text-sm font-semibold text-white"
            >
              Back to fundraiser
            </Link>
            {cart ? (
              <button
                type="button"
                onClick={handleDiscardCart}
                className="inline-flex rounded-lg border border-black/15 px-5 py-3 text-sm font-semibold"
              >
                Discard cart
              </button>
            ) : null}
            <Link
              href={webRegisterWithNext(checkoutPath)}
              className="inline-flex rounded-lg border border-black/15 px-5 py-3 text-sm font-semibold"
            >
              Create account
            </Link>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <section className="space-y-3 rounded-2xl border border-black/10 bg-white p-6">
            <h2 className="text-lg font-bold text-black">Cart</h2>
            <p className="text-sm text-black/65">
              {lineCount} item{lineCount === 1 ? '' : 's'} · campaign-scoped · ids only
            </p>
            <ul className="space-y-2 text-sm text-black/80">
              {cart.lines.map((line) => (
                <li key={`${line.campaignProductId}:${line.variantId}`}>
                  Variant {line.variantId.slice(0, 8)}… · qty {line.quantity}
                </li>
              ))}
            </ul>
            {cart.pendingOrderId ? (
              <p className="text-xs text-black/55">
                Pending order retained:{' '}
                <Link
                  href={`/orders/${cart.pendingOrderId}/confirm`}
                  className="font-semibold text-tamiym-blue underline"
                >
                  resume confirmation
                </Link>
              </p>
            ) : null}
            <button
              type="button"
              onClick={handleDiscardCart}
              className="text-sm font-semibold text-red-700 underline"
            >
              Discard cart
            </button>
          </section>

          <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-6">
            <h2 className="text-lg font-bold text-black">Delivery address</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {(
                [
                  ['recipientName', 'Recipient name'],
                  ['phone', 'Phone'],
                  ['addressLine1', 'Address line 1'],
                  ['addressLine2', 'Address line 2'],
                  ['city', 'City'],
                  ['state', 'State'],
                  ['postalCode', 'Postal code'],
                  ['country', 'Country'],
                ] as const
              ).map(([key, label]) => (
                <label key={key} className="space-y-2 text-sm font-medium text-black">
                  <span>{label}</span>
                  <input
                    value={form[key]}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, [key]: event.target.value }))
                    }
                    className="h-11 w-full rounded-xl border border-black/15 px-4 outline-none"
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={() => void handleReviewQuote()}
              disabled={isQuoting || !form.addressLine1 || !form.city || !form.state}
              className="inline-flex rounded-lg bg-tamiym-blue px-5 py-3 text-sm font-semibold text-white disabled:opacity-50"
            >
              {isQuoting ? 'Calculating…' : 'Review authoritative quote'}
            </button>
          </section>

          {quote ? (
            <section className="space-y-4 rounded-2xl border border-black/10 bg-white p-6">
              <h2 className="text-lg font-bold text-black">Quote</h2>
              <dl className="grid gap-2 text-sm text-black/80 sm:grid-cols-2">
                <div>
                  <dt className="text-black/50">Subtotal</dt>
                  <dd className="font-semibold">
                    {formatCurrency(quote.subtotalAmount, quote.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-black/50">Discount</dt>
                  <dd className="font-semibold">
                    {formatCurrency(quote.discountAmount, quote.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-black/50">Shipping</dt>
                  <dd className="font-semibold">
                    {formatCurrency(quote.shippingFee, quote.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-black/50">Total</dt>
                  <dd className="font-semibold">
                    {formatCurrency(quote.totalAmount, quote.currency)}
                  </dd>
                </div>
              </dl>
              <label className="flex items-start gap-3 text-sm text-black">
                <input
                  type="checkbox"
                  checked={quoteAccepted}
                  onChange={(event) => setQuoteAccepted(event.target.checked)}
                  className="mt-1"
                />
                <span>
                  I accept this quote (including any price or availability changes from the public
                  display) and want to place one order for this cart revision.
                </span>
              </label>
              <button
                type="button"
                onClick={() => void handlePlaceOrder()}
                disabled={!quoteAccepted || isSubmitting}
                className="inline-flex rounded-lg bg-accent px-5 py-3 text-sm font-bold text-tamiym-blue disabled:opacity-50"
              >
                {isSubmitting ? 'Starting payment…' : 'Accept quote & pay with Paystack'}
              </button>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
