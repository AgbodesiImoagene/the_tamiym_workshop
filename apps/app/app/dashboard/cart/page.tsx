'use client';

import { CustomerDashboardShell, formatCurrency } from '@/components/customer-dashboard-shell';
import { customerAssets } from '@/lib/assets';
import { ApiError, User, authApi } from '@/lib/auth';
import { removeCartItem, updateCartItemQuantity, useCart } from '@/lib/cart-store';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function DashboardCartPage() {
  const router = useRouter();
  const { items, subtotal, currency, itemCount } = useCart();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error) {
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
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="space-y-2">
            <h1 className="text-[32px] font-bold tracking-[-0.02em] text-black/90">Cart</h1>
            <p className="text-sm text-black/70">
              Review the items you want to turn into an order before checkout.
            </p>
          </div>
          <Link
            href="/dashboard/products"
            className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold text-black"
          >
            Continue shopping
          </Link>
        </div>

        {items.length === 0 ? (
          <div className="grid gap-8 rounded-[32px] border border-black/10 bg-white p-8 shadow-[0_4px_20px_rgba(0,0,0,0.08)] lg:grid-cols-[260px_minmax(0,1fr)] lg:items-center">
            <div className="relative mx-auto h-[220px] w-full max-w-[220px]">
              <Image
                src={customerAssets.emptyCartIllustration}
                alt=""
                fill
                className="object-contain"
                sizes="220px"
              />
            </div>
            <div className="space-y-4">
              <h2 className="text-2xl font-bold text-black/90">Your cart is empty</h2>
              <p className="max-w-xl text-sm leading-6 text-black/70">
                Add a product from the catalog to start your order. We will carry it into checkout
                together with your shipping address and payment flow.
              </p>
              <Link
                href="/dashboard/products"
                className="inline-flex rounded-lg bg-[#004385] px-5 py-3 text-sm font-semibold text-white"
              >
                Browse products
              </Link>
            </div>
          </div>
        ) : (
          <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_320px]">
            <section className="space-y-5">
              {items.map((item) => (
                <article
                  key={item.variantId}
                  className="grid gap-5 rounded-[28px] border border-black/10 bg-white p-5 shadow-[0_4px_12px_rgba(0,0,0,0.08)] sm:grid-cols-[120px_minmax(0,1fr)]"
                >
                  <div className="relative h-[140px] overflow-hidden rounded-[20px] bg-[linear-gradient(180deg,#f8fbff_0%,#eef3fb_100%)]">
                    {item.imageUrl ? (
                      <Image
                        src={item.imageUrl}
                        alt={item.productName}
                        fill
                        className="object-contain p-4"
                        sizes="120px"
                      />
                    ) : null}
                  </div>

                  <div className="space-y-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <h2 className="text-lg font-bold text-black">{item.productName}</h2>
                        <p className="text-sm text-black/70">{item.variantName}</p>
                        <p className="text-sm text-black/60">{item.optionSummary}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeCartItem(item.variantId)}
                        className="text-sm font-semibold text-[#b10813]"
                      >
                        Remove
                      </button>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() =>
                            updateCartItemQuantity(item.variantId, Math.max(1, item.quantity - 1))
                          }
                          className="h-10 w-10 rounded-full border border-black/15 text-lg"
                        >
                          -
                        </button>
                        <div className="min-w-10 text-center text-sm font-semibold">
                          {item.quantity}
                        </div>
                        <button
                          type="button"
                          onClick={() => updateCartItemQuantity(item.variantId, item.quantity + 1)}
                          className="h-10 w-10 rounded-full border border-black/15 text-lg"
                        >
                          +
                        </button>
                      </div>

                      <p className="text-base font-bold text-black">
                        {formatCurrency(item.unitPrice * item.quantity, item.currency)}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </section>

            <aside className="h-fit rounded-[28px] border border-black/10 bg-white p-6 shadow-[0_4px_12px_rgba(0,0,0,0.08)]">
              <div className="space-y-5">
                <div>
                  <h2 className="text-xl font-bold text-black/90">Order Summary</h2>
                  <p className="mt-1 text-sm text-black/65">
                    {itemCount} item(s) ready for checkout
                  </p>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-black/70">Subtotal</span>
                    <span className="font-semibold text-black">
                      {formatCurrency(subtotal, currency)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-black/70">Shipping</span>
                    <span className="text-black/60">Calculated in checkout</span>
                  </div>
                </div>

                <Link
                  href="/dashboard/checkout"
                  className="flex h-12 items-center justify-center rounded-lg bg-[#004385] text-sm font-bold text-white"
                >
                  Proceed to checkout
                </Link>
              </div>
            </aside>
          </div>
        )}
      </div>
    </CustomerDashboardShell>
  );
}
