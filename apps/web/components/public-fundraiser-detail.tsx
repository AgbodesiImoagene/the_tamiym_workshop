'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { marketingAssets } from '@/lib/assets';
import { Progress } from '@tamiym/ui';
import { customerAppPath, webLoginWithNext, webRegisterWithNext } from '@/lib/site';
import type { FundraiserSelection, PublicFundraiser } from '@/lib/fundraisers';
import { minorToMajor } from '@/lib/fundraisers';
import {
  applyOptionValueSelection,
  defaultOptionSelection,
  findVariantForSelection,
  isOptionValueSelectable,
} from '@/lib/fundraiser-selection';
import {
  addSelectionToCart,
  checkoutPathForSlug,
  loadCampaignCart,
  needsCampaignReplaceConfirm,
  saveCampaignCart,
} from '@/lib/campaign-cart';

function formatCurrency(amountMajor: number, currency: string) {
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(amountMajor);
}

interface PublicFundraiserDetailProps {
  fundraiser: PublicFundraiser;
}

export function PublicFundraiserDetail({ fundraiser }: PublicFundraiserDetailProps) {
  const router = useRouter();
  const currency = fundraiser.performance.currency || fundraiser.currency || 'NGN';
  const products = fundraiser.products ?? [];
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selectedByOptionId, setSelectedByOptionId] = useState<Record<string, string>>(() =>
    products[0] ? defaultOptionSelection(products[0]) : {}
  );
  const [shareDone, setShareDone] = useState(false);
  const [cartMessage, setCartMessage] = useState<string | null>(null);

  const selected = products[selectedIndex] ?? products[0] ?? null;
  const checkoutPath = checkoutPathForSlug(fundraiser.slug);
  const registerHref = webRegisterWithNext(checkoutPath);
  const loginHref = webLoginWithNext(checkoutPath);

  const organizerName = useMemo(() => {
    const first = fundraiser.organizer?.firstName?.trim();
    const last = fundraiser.organizer?.lastName?.trim();
    return [first, last].filter(Boolean).join(' ') || 'Campaign organizer';
  }, [fundraiser.organizer?.firstName, fundraiser.organizer?.lastName]);

  const resolvedVariant = selected ? findVariantForSelection(selected, selectedByOptionId) : null;

  const selection: FundraiserSelection | null =
    selected && resolvedVariant?.available
      ? {
          campaignId: fundraiser.id,
          campaignProductId: selected.campaignProductId,
          productId: selected.productId,
          variantId: resolvedVariant.id,
          designId: selected.design.id,
          quantity,
        }
      : null;

  const imageUrl = selected?.design?.thumbnailUrl || marketingAssets.fundraiserDetailFallback;
  const unitAmountMinor = resolvedVariant?.unitAmountMinor ?? selected?.baseAmountMinor ?? 0;
  const displayCurrency = resolvedVariant?.currency ?? selected?.currency ?? currency;
  const displayPriceMajor = minorToMajor(unitAmountMinor, displayCurrency);
  const priceDisclosure = selected?.priceDisclosure ?? 'before discounts, shipping and VAT';

  const goal = fundraiser.performance.goalAmount ?? fundraiser.goalAmount ?? null;
  const raised = Number(fundraiser.performance.currentAmount ?? fundraiser.currentAmount ?? 0);
  const progressPct =
    goal != null && goal > 0 ? Math.min(100, Math.round((raised / goal) * 100)) : null;

  const statusMessage = useMemo(() => {
    if (!selected) {
      return 'No sellable products on this campaign.';
    }
    if (!resolvedVariant) {
      return 'Selected options are not a valid combination.';
    }
    if (!resolvedVariant.available) {
      return 'That option combination is unavailable.';
    }
    const optionLabels = selected.options
      .map((opt) => {
        const valueId = selectedByOptionId[opt.id];
        const value = opt.values.find((v) => v.id === valueId);
        return value ? `${opt.name} ${value.displayName}` : null;
      })
      .filter(Boolean)
      .join(', ');
    return `${selected.product.name}, ${optionLabels || 'default options'}, ${formatCurrency(
      displayPriceMajor,
      displayCurrency
    )}, quantity ${quantity}.`;
  }, [selected, resolvedVariant, selectedByOptionId, displayPriceMajor, displayCurrency, quantity]);

  function selectProduct(index: number) {
    setSelectedIndex(index);
    setQuantity(1);
    const next = products[index];
    setSelectedByOptionId(next ? defaultOptionSelection(next) : {});
  }

  function selectOptionValue(optionId: string, valueId: string) {
    if (!selected) return;
    setSelectedByOptionId((prev) => applyOptionValueSelection(selected, prev, optionId, valueId));
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setShareDone(true);
      setTimeout(() => setShareDone(false), 2500);
    } catch {
      setShareDone(false);
    }
  }

  function persistSelection(replaceCampaign: boolean) {
    if (!selection) return null;
    const next = addSelectionToCart(loadCampaignCart(), selection, { replaceCampaign });
    saveCampaignCart(next);
    return next;
  }

  function handleAddToCart() {
    if (!selection) return;
    setCartMessage(null);
    const existing = loadCampaignCart();
    if (needsCampaignReplaceConfirm(existing, selection.campaignId)) {
      const confirmed = window.confirm(
        'Your cart has items from another fundraiser. Replace the cart with this campaign?'
      );
      if (!confirmed) return;
      persistSelection(true);
      setCartMessage('Cart updated with this campaign.');
      return;
    }
    persistSelection(false);
    setCartMessage('Added to cart.');
  }

  function handleCheckout() {
    if (!selection) return;
    setCartMessage(null);
    const existing = loadCampaignCart();
    if (needsCampaignReplaceConfirm(existing, selection.campaignId)) {
      const confirmed = window.confirm(
        'Your cart has items from another fundraiser. Replace the cart with this campaign and continue to checkout?'
      );
      if (!confirmed) return;
      persistSelection(true);
    } else {
      persistSelection(false);
    }
    router.push(checkoutPath);
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

          <p className="sr-only" aria-live="polite">
            {statusMessage}
          </p>

          {products.length === 0 ? (
            <p className="text-center text-sm text-black/70">
              No sellable products are available for this campaign right now.
            </p>
          ) : (
            <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,420px)] lg:items-start lg:gap-14">
              <div className="space-y-4">
                {products.length > 1 ? (
                  <div
                    className="flex flex-wrap gap-3"
                    role="tablist"
                    aria-label="Campaign products"
                  >
                    {products.map((p, i) => (
                      <button
                        key={p.campaignProductId}
                        type="button"
                        role="tab"
                        aria-selected={i === selectedIndex}
                        onClick={() => selectProduct(i)}
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
                    alt={
                      selected
                        ? `${selected.design.name} design on ${selected.product.name}`
                        : fundraiser.title
                    }
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
                  Choose options, add them to your cart, then sign in to confirm shipping and pay.
                </p>

                <div>
                  <p className="text-2xl font-semibold text-black md:text-3xl">
                    {formatCurrency(displayPriceMajor, displayCurrency)}
                  </p>
                  <p className="mt-1 text-xs text-black/55">Per item, {priceDisclosure}</p>
                </div>

                {selected?.options.map((option) => {
                  const isColorish =
                    option.code.toLowerCase().includes('color') ||
                    option.code.toLowerCase().includes('colour') ||
                    option.values.some((v) => typeof v.metadata?.hex === 'string');
                  return (
                    <div key={option.id} className="space-y-2">
                      <p className="text-sm font-medium text-black">{option.name}</p>
                      <div className="flex flex-wrap gap-2" role="group" aria-label={option.name}>
                        {option.values.map((value) => {
                          const selectedValue = selectedByOptionId[option.id] === value.id;
                          const selectable = isOptionValueSelectable(selected, value.id);
                          const hex =
                            typeof value.metadata?.hex === 'string' ? value.metadata.hex : null;
                          if (isColorish && hex) {
                            return (
                              <button
                                key={value.id}
                                type="button"
                                disabled={!selectable}
                                onClick={() => selectOptionValue(option.id, value.id)}
                                className={`h-8 w-8 rounded-md border border-black/15 disabled:cursor-not-allowed disabled:opacity-40 ${
                                  selectedValue ? 'ring-2 ring-tamiym-blue ring-offset-2' : ''
                                }`}
                                style={{ backgroundColor: hex }}
                                aria-label={`${option.name} ${value.displayName}${
                                  selectable ? '' : ' (unavailable)'
                                }`}
                                aria-pressed={selectedValue}
                              />
                            );
                          }
                          return (
                            <button
                              key={value.id}
                              type="button"
                              disabled={!selectable}
                              onClick={() => selectOptionValue(option.id, value.id)}
                              className={`rounded-lg border px-3 py-2 text-xs font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                                selectedValue
                                  ? 'border-tamiym-blue bg-primary-50 text-tamiym-blue'
                                  : 'border-black/20 bg-white text-black'
                              }`}
                              aria-pressed={selectedValue}
                            >
                              {value.displayName}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {resolvedVariant && !resolvedVariant.available ? (
                  <p className="text-sm text-red-700" role="status">
                    This combination is unavailable. Choose another option.
                  </p>
                ) : null}

                <div className="space-y-2">
                  <p className="text-sm font-medium text-black">Quantity</p>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQuantity((value: number) => Math.max(1, value - 1))}
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/5 text-lg font-medium"
                      aria-label="Decrease quantity"
                    >
                      −
                    </button>
                    <div
                      className="flex h-10 min-w-10 items-center justify-center text-sm font-semibold"
                      aria-live="polite"
                    >
                      {quantity}
                    </div>
                    <button
                      type="button"
                      onClick={() => setQuantity((value: number) => Math.min(99, value + 1))}
                      className="flex h-10 w-10 items-center justify-center rounded-lg bg-black/5 text-lg font-medium"
                      aria-label="Increase quantity"
                    >
                      +
                    </button>
                  </div>
                </div>

                {cartMessage ? (
                  <p className="text-sm text-tamiym-blue" role="status">
                    {cartMessage}
                  </p>
                ) : null}

                <div className="space-y-3 border-t border-black/10 pt-4">
                  <button
                    type="button"
                    disabled={!selection}
                    onClick={handleAddToCart}
                    className={`flex h-11 w-full items-center justify-center rounded-lg border text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                      selection
                        ? 'border-black/20 text-tamiym-blue'
                        : 'border-black/10 text-black/40'
                    }`}
                  >
                    Add to cart
                  </button>
                  <button
                    type="button"
                    disabled={!selection}
                    onClick={handleCheckout}
                    className={`flex h-12 w-full items-center justify-center rounded-lg text-sm font-bold disabled:cursor-not-allowed disabled:opacity-40 ${
                      selection ? 'bg-accent text-tamiym-blue' : 'bg-black/10 text-black/40'
                    }`}
                  >
                    Checkout
                  </button>
                  <Link
                    href={registerHref}
                    aria-disabled={!selection}
                    className={`flex h-11 items-center justify-center rounded-lg border text-sm font-semibold ${
                      selection
                        ? 'border-black/20 text-tamiym-blue'
                        : 'pointer-events-none border-black/10 text-black/40'
                    }`}
                  >
                    New here? Sign up &amp; checkout
                  </Link>
                  <Link
                    href={loginHref}
                    aria-disabled={!selection}
                    className={`flex h-11 items-center justify-center rounded-lg border text-sm font-semibold ${
                      selection
                        ? 'border-black/20 text-tamiym-blue'
                        : 'pointer-events-none border-black/10 text-black/40'
                    }`}
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
