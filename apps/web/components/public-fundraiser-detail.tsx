'use client';

import { useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { marketingAssets } from '@/lib/assets';
import { customerAppPath } from '@/lib/site';
import type { PublicFundraiser } from '@/lib/fundraisers';

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

interface PublicFundraiserDetailProps {
  fundraiser: PublicFundraiser;
}

export function PublicFundraiserDetail({ fundraiser }: PublicFundraiserDetailProps) {
  const [quantity, setQuantity] = useState(1);
  const [selectedSize, setSelectedSize] = useState('M');
  const [selectedColor, setSelectedColor] = useState(colorSwatches[0]);

  const primaryProduct = fundraiser.products[0];
  const price = primaryProduct?.prices[0];
  const organizerName = useMemo(() => {
    const first = fundraiser.organizer?.firstName?.trim();
    const last = fundraiser.organizer?.lastName?.trim();
    return [first, last].filter(Boolean).join(' ') || 'Organizer Name';
  }, [fundraiser.organizer?.firstName, fundraiser.organizer?.lastName]);

  const imageUrl =
    primaryProduct?.design?.thumbnailUrl || marketingAssets.fundraiserDetailFallback;

  return (
    <div className="space-y-8">
      <div className="overflow-hidden bg-tamiym-blue px-6 py-5 text-center lg:px-8">
        <div className="mx-auto max-w-7xl">
          <Link
            href={customerAppPath('/auth/register')}
            className="inline-flex rounded-lg bg-accent px-5 py-3 text-sm font-bold text-tamiym-blue"
          >
            Create your own fundraiser
          </Link>
        </div>
      </div>

      <section className="mx-auto max-w-7xl px-6 pb-16 lg:px-8">
        <div className="space-y-2 text-center text-tamiym-blue">
          <h1 className="text-4xl font-bold tracking-[-0.03em] md:text-5xl">
            &quot;{fundraiser.title}&quot;
          </h1>
          <p className="text-sm font-bold text-black">Organized by &quot;{organizerName}&quot;</p>
        </div>

        <div className="mt-12 grid gap-10 lg:grid-cols-[540px_minmax(0,488px)] lg:items-start">
          <div className="space-y-4">
            <div className="relative h-[360px] overflow-hidden rounded-2xl border border-black/20 bg-white sm:h-[517px]">
              <Image
                src={imageUrl}
                alt={primaryProduct?.product.name || fundraiser.title}
                fill
                className="object-cover"
                sizes="(min-width: 1024px) 540px, 100vw"
              />
            </div>
            <h2 className="text-[1.75rem] font-bold text-black">
              {primaryProduct?.product.name || 'Soft T-shirt'}
            </h2>
          </div>

          <div className="space-y-7">
            <div className="space-y-3">
              <p className="text-xs text-black">CampaignProduct</p>
              <h2 className="text-2xl font-semibold tracking-[-0.02em] text-black">About Campaign</h2>
              <p className="text-sm leading-[1.5] text-black">
                {fundraiser.story || fundraiser.description || 'Support this fundraiser by choosing a product and donating toward the campaign goal.'}
              </p>
              <span className="inline-flex rounded-lg bg-accent-600 px-3 py-1 text-[10px] font-bold text-white">
                Tag
              </span>
              <p className="text-[1.75rem] font-medium text-black">
                {price ? formatCurrency(price.amount, price.currency) : formatCurrency(5000, 'NGN')}
              </p>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <p className="text-sm text-black">select color</p>
                <div className="flex flex-wrap gap-2">
                  {colorSwatches.map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      onClick={() => setSelectedColor(swatch)}
                      className={`h-4 w-4 rounded-[3px] border border-black/15 ${
                        selectedColor === swatch ? 'ring-2 ring-tamiym-blue ring-offset-2' : ''
                      }`}
                      style={{
                        backgroundColor: swatch,
                      }}
                    />
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-black">select size</p>
                <div className="flex flex-wrap gap-3 text-xs text-black">
                  {sizeOptions.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setSelectedSize(size)}
                      className={`rounded border px-2 py-1 ${
                        selectedSize === size
                          ? 'border-tamiym-blue bg-primary-50 text-tamiym-blue'
                          : 'border-black/20 bg-white'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm text-black">Quantity</p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                    className="h-10 w-10 bg-gray-100 text-lg"
                  >
                    -
                  </button>
                  <div className="flex h-10 min-w-8 items-center justify-center text-sm">{quantity}</div>
                  <button
                    type="button"
                    onClick={() => setQuantity((value) => value + 1)}
                    className="h-10 w-10 bg-gray-100 text-lg"
                  >
                    +
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                <p className="text-sm text-black">
                  {fundraiser.performance.currentAmount
                    ? `${Math.max(1, Math.round(fundraiser.performance.currentAmount / 5000))} items sold`
                    : '0 items sold'}{' '}
                  of {fundraiser.performance.goalAmount ? Math.max(1, Math.round(fundraiser.performance.goalAmount / 5000)) : 50} goal
                </p>
                <div className="rounded-xl border border-black/15 px-4 py-3 text-sm text-gray-500">
                  Value
                </div>
                <Link
                  href={customerAppPath('/auth/register')}
                  className="flex h-12 items-center justify-center rounded-lg bg-accent text-sm font-bold text-tamiym-blue"
                >
                  Buy/Donate
                </Link>
                <button
                  type="button"
                  onClick={async () => {
                    await navigator.clipboard.writeText(window.location.href);
                  }}
                  className="flex h-12 w-full items-center justify-center rounded-lg bg-tamiym-evening-blue text-sm font-bold text-tamiym-blue"
                >
                  Share
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
