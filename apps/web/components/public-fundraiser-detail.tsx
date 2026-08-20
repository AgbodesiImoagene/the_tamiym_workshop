'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { marketingAssets } from '@/lib/assets';
import { Progress } from '@tamiym/ui';
import { customerAppPath, webLoginWithNext, webRegisterWithNext } from '@/lib/site';
import type { PublicFundraiser, PublicFundraiserProduct } from '@/lib/fundraisers';

const colorSwatches = [
  '#0387b8',
  '#ad6c8f',
  '#f40928',
  '#ffffff',
  '#3ba658',
  '#4f237a',
  '#e79628',
  '#413829',
  '#1c203b',
  '#be5269',
];

const sizeOptions = ['S', 'M', 'L', 'XL', '2XL', '3XL', '4XL', '5XL'];

function formatCurrency(amount: number, currency: string) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

function priceAmount(
  prices: PublicFundraiserProduct['prices'],
  currency: string
): { amount: number; currency: string } | null {
  const row = prices.find((p) => p.currency === currency) ?? prices[0];
  if (!row) return null;
  const raw = row.amount as unknown;
  const amount =
    typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : Number(raw);
  if (Number.isNaN(amount)) return null;
  return { amount, currency: row.currency };
}

interface PublicFundraiserDetailProps {
  fundraiser: PublicFundraiser;
}

export function PublicFundraiserDetail({ fundraiser }: PublicFundraiserDetailProps) {
  const currency = fundraiser.performance.currency || 'NGN';
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState('M');
  const [selectedColor, setSelectedColor] = useState(colorSwatches[0]);
  const [shareDone, setShareDone] = useState(false);

  const products = fundraiser.products ?? [];
  const selected = products[selectedIndex] ?? products[0];
  const returnPath = `/fundraiser/${fundraiser.slug}`;
  const registerHref = webRegisterWithNext(returnPath);
  const loginHref = webLoginWithNext(returnPath);

  const organizerName = useMemo(() => {
    const first = fundraiser.organizer?.firstName?.trim();
    const last = fundraiser.organizer?.lastName?.trim();
    return [first, last].filter(Boolean).join(' ') || 'Campaign organizer';
  }, [fundraiser.organizer?.firstName, fundraiser.organizer?.lastName]);

  const imageUrl = selected?.design?.thumbnailUrl || marketingAssets.fundraiserDetailFallback;

  const priceInfo = selected ? priceAmount(selected.prices, currency) : null;
  const displayPrice = priceInfo ?? { amount: 0, currency };

  const goal = fundraiser.performance.goalAmount ?? fundraiser.goalAmount ?? null;
  const raised = Number(fundraiser.performance.currentAmount ?? fundraiser.currentAmount ?? 0);
  const progressPct =
    goal != null && goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : null;

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareDone(true);
      setTimeout(() => setShareDone(false), 2500);
    } catch {
      setShareDone(false);
    }
  }

  return (
    <div className="space-y-0">
      <div className="bg-tamiym-blue px-6 py-5 text-center lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-3">
          <Link
            href={customerAppPath('/dashboard/fundraiser')}
            className="inline-flex rounded-lg bg-accent px-5 py-3 text-sm font-bold text-tamiym-blue"
          >
            Create your own fundraiser
          </Link>
          <span className="hidden text-sm text-white/80 sm:inline">·</span>
          <p className="text-xs text-white/90 sm:text-sm">
            Active campaign — purchases support this fundraiser after you sign in.
          </p>
        </div>
      </div>

      <section className="mx-auto max-w-7xl px-6 py-12 lg:px-8">
        <div className="space-y-3 text-center text-tamiym-blue">
          <p className="text-xs font-bold uppercase tracking-wide text-black/60">Fundraiser</p>
          <h1 className="text-3xl font-bold tracking-[-0.03em] md:text-5xl">{fundraiser.title}</h1>
          <p className="text-sm font-semibold text-black">Organized by {organizerName}</p>
        </div>

        {(fundraiser.description || fundraiser.story) && (
          <div className="mx-auto mt-10 max-w-3xl space-y-6 text-center text-sm leading-relaxed text-black md:text-left">
            {fundraiser.description ? (
              <div className="space-y-2">
                <h2 className="text-lg font-bold text-tamiym-blue">About this campaign</h2>
                <p className="text-black/85">{fundraiser.description}</p>
              </div>
            ) : null}
            {fundraiser.story ? (
              <div className="space-y-2 border-t border-black/10 pt-6">
                <h2 className="text-lg font-bold text-tamiym-blue">Our story</h2>
                <p className="whitespace-pre-wrap text-black/85">{fundraiser.story}</p>
              </div>
            ) : null}
          </div>
        )}

        {goal != null && goal > 0 ? (
          <div className="mx-auto mt-10 max-w-2xl space-y-2">
            <div className="flex justify-between text-xs font-semibold text-black">
              <span>Raised</span>
              <span>
                {formatCurrency(raised, currency)} of {formatCurrency(goal, currency)}
              </span>
            </div>
            <Progress value={progressPct ?? 0} className="h-2" />
          </div>
        ) : null}

        <div className="mt-14">
          <h2 className="mb-6 text-center text-xl font-bold text-tamiym-blue md:text-left">
            Campaign products
          </h2>

          {products.length === 0 ? (
            <p className="text-center text-sm text-black/70">
              No products are attached to this campaign yet.
            </p>
          ) : (
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start lg:gap-14">
              <div className="space-y-4">
                {products.length > 1 ? (
                  <div className="flex flex-wrap gap-3">
                    {products.map((p, i) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSelectedIndex(i)}
                        className={`rounded-xl border-2 px-4 py-2 text-left text-sm font-semibold transition ${
                          i === selectedIndex
                            ? 'border-tamiym-blue bg-primary-50 text-tamiym-blue'
                            : 'border-black/15 bg-white text-black hover:border-black/25'
                        }`}
                      >
                        {p.product.name}
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="relative mx-auto aspect-[540/517] max-h-[517px] w-full max-w-[540px] overflow-hidden rounded-2xl border border-black/20 bg-white lg:mx-0">
                  <Image
                    src={imageUrl}
                    alt={selected?.product.name || fundraiser.title}
                    fill
                    className="object-cover"
                    sizes="(min-width: 1024px) 540px, 100vw"
                    priority
                  />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-black md:text-2xl">
                    {selected?.product.name}
                  </h3>
                  {selected?.product.description ? (
                    <p className="mt-2 max-w-xl text-sm leading-relaxed text-black/75">
                      {selected.product.description}
                    </p>
                  ) : null}
                </div>
              </div>

              <div className="space-y-6 rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
                <p className="text-xs text-black/60">
                  Choose options here; you will confirm size, shipping, and payment after you sign
                  in or create an account.
                </p>

                <div>
                  <p className="text-2xl font-semibold text-black md:text-3xl">
                    {formatCurrency(displayPrice.amount, displayPrice.currency)}
                  </p>
                  <p className="mt-1 text-xs text-black/55">Campaign price (per item)</p>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-black">Color</p>
                  <div className="flex flex-wrap gap-2">
                    {colorSwatches.map((swatch) => (
                      <button
                        key={swatch}
                        type="button"
                        onClick={() => setSelectedColor(swatch)}
                        className={`h-8 w-8 rounded-md border border-black/15 ${
                          selectedColor === swatch ? 'ring-2 ring-tamiym-blue ring-offset-2' : ''
                        }`}
                        style={{ backgroundColor: swatch }}
                        aria-label={`Color ${swatch}`}
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-black">Size</p>
                  <div className="flex flex-wrap gap-2">
                    {sizeOptions.map((size) => (
                      <button
                        key={size}
                        type="button"
                        onClick={() => setSelectedSize(size)}
                        className={`rounded-lg border px-3 py-2 text-xs font-semibold ${
                          selectedSize === size
                            ? 'border-tamiym-blue bg-primary-50 text-tamiym-blue'
                            : 'border-black/20 bg-white text-black'
                        }`}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-black">Quantity</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuantity((value: number) => Math.max(1, value - 1))}
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/5 text-lg font-medium"
                    >
                      −
                    </button>
                    <div className="flex h-10 min-w-10 items-center justify-center text-sm font-semibold">
                      {quantity}
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuantity((value: number) => value + 1)}
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/5 text-lg font-medium"
                    >
                      +
                    </button>
                  </div>
                </div>

                <div className="space-y-3 border-t border-black/10 pt-4">
                  <Link
                    href={registerHref}
                    className="flex h-12 items-center justify-center rounded-lg bg-accent text-sm font-bold text-tamiym-blue"
                  >
                    Continue to sign up &amp; checkout
                  </Link>
                  <Link
                    href={loginHref}
                    className="flex h-11 items-center justify-center rounded-lg border border-black/20 text-sm font-semibold text-tamiym-blue"
                  >
                    Already have an account? Sign in
                  </Link>
                  <button
                    type="button"
                    onClick={() => void copyShareLink()}
                    className="flex h-11 w-full items-center justify-center rounded-lg bg-tamiym-evening-blue text-sm font-bold text-tamiym-blue"
                  >
                    {shareDone ? 'Link copied' : 'Share this campaign'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
