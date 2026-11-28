'use client';

import { formatCurrency } from '@/components/customer-dashboard-shell';
import { ProductImagePlaceholder } from '@/components/product-image-placeholder';
import { ApiError } from '@/lib/auth';
import { addCartItem } from '@/lib/cart-store';
import { quoteOrder, type OrderQuote } from '@/lib/checkout';
import { designThumbnailSrc } from '@/lib/design-thumbnail';
import { getDesign } from '@/lib/designs';
import { getUserAddresses } from '@/lib/profile';
import { groupVariantsByColor, headlinePrice, imagesForColor } from '@/lib/product-variants';
import { getDashboardProductDetail, getDashboardProducts } from '@/lib/products';
import { Badge, Button } from '@tamiym/ui';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useRef, useState } from 'react';
import { useCurrentUser } from '@/lib/current-user';

const MAX_UNTRACKED_QUANTITY = 999;
const MAX_RELATED_PRODUCTS = 4;

function clampQuantity(raw: string, max: number | null) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, max ?? MAX_UNTRACKED_QUANTITY);
}

/** Remounts per product so a related-product link starts with a clean selection. */
export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  return (
    <Suspense fallback={null}>
      <ProductDetailContent key={params.id} productId={params.id} />
    </Suspense>
  );
}

type QuoteStatus = 'idle' | 'loading' | 'error' | 'no-address';

function ProductDetailContent({ productId }: { productId: string }) {
  // TTW-058: opened from a saved design, the page orders that design.
  const designId = useSearchParams().get('designId');
  const router = useRouter();

  const { user } = useCurrentUser();
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [cartMessage, setCartMessage] = useState<string | null>(null);
  const [quote, setQuote] = useState<OrderQuote | null>(null);
  const [quoteStatus, setQuoteStatus] = useState<QuoteStatus>('idle');
  // A quote that comes back after the quantities changed must not be shown.
  const quoteRequestId = useRef(0);

  const productQuery = useQuery({
    queryKey: ['dashboard-product', productId],
    queryFn: () => getDashboardProductDetail(productId),
    enabled: !!user && !!productId,
    retry: false,
  });

  const designQuery = useQuery({
    queryKey: ['dashboard-design', designId],
    queryFn: () => getDesign(designId as string),
    enabled: !!user && !!designId,
    retry: false,
  });
  const design = designQuery.data;

  const product = productQuery.data;
  const categorySlug = product?.category?.slug;
  // Products of the same category only; one extra leaves room for the current product.
  const listQuery = useQuery({
    queryKey: ['dashboard-related-products', categorySlug],
    queryFn: () => getDashboardProducts({ categorySlug, limit: MAX_RELATED_PRODUCTS + 1 }),
    enabled: !!user && !!categorySlug,
  });
  const groups = useMemo(() => (product ? groupVariantsByColor(product) : []), [product]);
  const activeGroup = groups.find((group) => group.code === selectedColor) ?? groups[0];
  const images = useMemo(
    () => (product && activeGroup ? imagesForColor(product, activeGroup) : []),
    [product, activeGroup]
  );
  const mainImage = images[selectedImage] ?? images[0];
  const price = product ? headlinePrice(product, activeGroup) : null;
  const inStock = activeGroup?.choices.some((choice) => choice.purchasable) ?? false;
  const showColours = groups.length > 1 || !!activeGroup?.isColor;
  const canBuy = groups.some((group) => group.choices.some((choice) => choice.purchasable));

  const chosen = groups.flatMap((group) =>
    group.choices
      .filter((choice) => choice.purchasable && (quantities[choice.variantId] ?? 0) > 0)
      .map((choice) => ({
        group,
        choice,
        // Stock may have dropped since the customer typed (the query refetches on focus).
        quantity: Math.min(
          quantities[choice.variantId],
          choice.maxQuantity ?? MAX_UNTRACKED_QUANTITY
        ),
      }))
  );
  const totalQuantity = chosen.reduce((sum, entry) => sum + entry.quantity, 0);

  // Why the design cannot be ordered here, or null when it can (or when there is none).
  const designError = designId
    ? designQuery.isError
      ? (designQuery.error as ApiError | null)?.statusCode === 404
        ? 'This design could not be found.'
        : 'We could not load this design.'
      : design && product && design.productId !== product.id
        ? `"${design.name}" is not a design of this product.`
        : design?.moderationStatus === 'REJECTED'
          ? `"${design.name}" was rejected and cannot be ordered.`
          : null
    : null;
  const designPending = !!designId && !designError && !design;

  const changeQuantities = () => {
    quoteRequestId.current += 1;
    setCartMessage(null);
    setQuote(null);
    setQuoteStatus('idle');
  };

  const getPrice = async () => {
    if (!designId || totalQuantity === 0) return;
    const requestId = ++quoteRequestId.current;
    setQuote(null);
    setQuoteStatus('loading');
    try {
      const addresses = await getUserAddresses();
      if (requestId !== quoteRequestId.current) return;
      const address = addresses.find((entry) => entry.isDefault) ?? addresses[0];
      if (!address) {
        setQuoteStatus('no-address');
        return;
      }
      const result = await quoteOrder({
        shippingAddressId: address.id,
        items: chosen.map(({ choice, quantity }) => ({
          variantId: choice.variantId,
          quantity,
          designId,
        })),
      });
      if (requestId !== quoteRequestId.current) return;
      setQuote(result);
      setQuoteStatus('idle');
    } catch {
      if (requestId === quoteRequestId.current) setQuoteStatus('error');
    }
  };

  const related = (listQuery.data ?? [])
    .filter(
      (entry) =>
        entry.id !== productId &&
        !!product?.category?.id &&
        entry.category?.id === product.category.id
    )
    .slice(0, MAX_RELATED_PRODUCTS);

  const addToCart = () => {
    if (!product || totalQuantity === 0) return;
    const designImage = designThumbnailSrc(design?.thumbnailUrl);
    for (const { group, choice, quantity } of chosen) {
      // The quote (when asked for) includes the design's view surcharge. Display only: checkout quotes again.
      const quoted = quote?.items.find((line) => line.variantId === choice.variantId);
      addCartItem({
        productId: product.id,
        productName: product.name,
        variantId: choice.variantId,
        variantName: choice.variantName,
        optionSummary: choice.optionSummary,
        quantity,
        unitPrice: quoted?.unitFinalPrice ?? choice.unitPrice,
        currency: choice.currency,
        imageUrl: designImage ?? imagesForColor(product, group)[0]?.url ?? null,
        ...(design ? { designId: design.id, designName: design.name } : {}),
      });
    }
    setQuantities({});
    changeQuantities();
    setCartMessage(
      totalQuantity === 1
        ? '1 item was added to your cart.'
        : `${totalQuantity} items were added to your cart.`
    );
  };

  const proceedToCheckout = () => {
    if (!product || totalQuantity === 0) return;
    // Also empties the selection, which disables the button: a second click adds nothing.
    addToCart();
    router.push('/dashboard/checkout');
  };

  const productError = productQuery.error as ApiError | null;

  return (
    <>
      <div className="mt-10 space-y-8 lg:mt-0">
        <Link
          href="/dashboard/products"
          className="text-sm font-semibold text-primary hover:underline"
        >
          Back to products
        </Link>

        {!user || productQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading product...</p>
        ) : productQuery.isError && productError?.statusCode === 404 ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">This product could not be found.</p>
          </div>
        ) : productQuery.isError ? (
          <div className="space-y-3">
            <p className="text-sm text-destructive">We could not load this product.</p>
            <button
              type="button"
              onClick={() => void productQuery.refetch()}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground"
            >
              Try again
            </button>
          </div>
        ) : product ? (
          <>
            <div className="grid gap-8 lg:grid-cols-2">
              <div className="space-y-3">
                <div className="relative h-[360px] w-full overflow-hidden rounded-[28px] border border-border bg-muted">
                  {mainImage ? (
                    <Image
                      src={mainImage.url}
                      alt={mainImage.altText || product.name}
                      fill
                      className="object-contain p-5"
                      sizes="(min-width: 1024px) 45vw, 100vw"
                    />
                  ) : (
                    <ProductImagePlaceholder />
                  )}
                </div>
                {images.length > 1 ? (
                  <div className="flex flex-wrap gap-2">
                    {images.map((image, index) => (
                      <button
                        key={image.id}
                        type="button"
                        aria-label={`Show image ${index + 1}`}
                        aria-pressed={image.id === mainImage?.id}
                        onClick={() => setSelectedImage(index)}
                        className="relative h-16 w-16 overflow-hidden rounded-md border border-border bg-muted aria-pressed:border-primary"
                      >
                        <Image
                          src={image.url}
                          alt=""
                          fill
                          className="object-contain p-1"
                          sizes="64px"
                        />
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>

              <div className="space-y-6">
                <div className="space-y-2">
                  {product.category?.name ? (
                    <p className="text-sm text-muted-foreground">{product.category.name}</p>
                  ) : null}
                  <h1 className="text-[32px] font-bold tracking-[-0.02em] text-foreground">
                    {product.name}
                  </h1>
                  {activeGroup ? (
                    <Badge data-testid="stock-status" variant={inStock ? 'accent' : 'danger'}>
                      {inStock ? 'In stock' : 'Out of stock'}
                    </Badge>
                  ) : null}
                  {product.description ? (
                    <p className="text-sm text-foreground/80">{product.description}</p>
                  ) : null}
                  <p className="flex flex-wrap items-baseline gap-x-3 pt-1">
                    <span
                      data-testid="product-price"
                      className="text-2xl font-bold text-foreground"
                    >
                      {price
                        ? `${price.from ? 'From ' : ''}${formatCurrency(price.amount, price.currency)}`
                        : 'Quote on request'}
                    </span>
                    {price?.compareAt ? (
                      <s
                        data-testid="product-compare-at"
                        className="text-base text-muted-foreground"
                      >
                        <span className="sr-only">Original price: </span>
                        {formatCurrency(price.compareAt, price.currency)}
                      </s>
                    ) : null}
                  </p>
                </div>

                {designId ? (
                  <div className="flex items-center gap-3 rounded-2xl border border-border px-4 py-3">
                    {design?.thumbnailUrl && designThumbnailSrc(design.thumbnailUrl) ? (
                      <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-md border border-border bg-muted">
                        <Image
                          src={designThumbnailSrc(design.thumbnailUrl) as string}
                          alt={design.name}
                          fill
                          // Private picture: loaded by the browser with the session cookie.
                          unoptimized
                          className="object-contain"
                          sizes="56px"
                        />
                      </div>
                    ) : null}
                    <div className="space-y-0.5">
                      <p className="text-xs text-muted-foreground">Ordering your design</p>
                      <p className="text-sm font-semibold text-foreground">
                        {design && !designError ? design.name : designPending ? 'Loading…' : ''}
                      </p>
                    </div>
                  </div>
                ) : null}

                {designError ? (
                  <div className="space-y-3">
                    <p role="alert" className="text-sm text-destructive">
                      {designError}
                    </p>
                    <Link
                      href="/dashboard/design"
                      className="text-sm font-semibold text-primary hover:underline"
                    >
                      Back to my designs
                    </Link>
                  </div>
                ) : designPending ? null : !canBuy ? (
                  <p className="rounded-2xl border border-dashed border-border px-5 py-4 text-sm text-muted-foreground">
                    This product is not available to order yet.
                  </p>
                ) : (
                  <>
                    {showColours ? (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-foreground">
                          Colour
                          {activeGroup?.isColor ? (
                            <span
                              data-testid="selected-colour"
                              className="ml-2 font-normal text-muted-foreground"
                            >
                              {activeGroup.label}
                            </span>
                          ) : null}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {groups.map((group) => (
                            <button
                              key={group.code}
                              type="button"
                              aria-label={group.label}
                              title={group.label}
                              aria-pressed={group.code === activeGroup?.code}
                              onClick={() => {
                                setSelectedColor(group.code);
                                setSelectedImage(0);
                              }}
                              className={
                                group.hex
                                  ? 'h-8 w-8 rounded-md border border-border aria-pressed:ring-2 aria-pressed:ring-primary aria-pressed:ring-offset-2'
                                  : 'rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground'
                              }
                              style={group.hex ? { backgroundColor: group.hex } : undefined}
                            >
                              {group.hex ? null : group.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    <div className="space-y-2">
                      <p className="text-sm font-semibold text-foreground">Quantity per size</p>
                      <ul className="space-y-2">
                        {activeGroup?.choices.map((choice) => (
                          <li
                            key={choice.variantId}
                            className="flex items-center justify-between gap-4 rounded-2xl border border-border px-4 py-3"
                          >
                            <div className="space-y-0.5">
                              <p className="text-sm font-semibold text-foreground">
                                {choice.purchasable
                                  ? choice.sizeLabel
                                  : `${choice.sizeLabel} · Out of stock`}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {formatCurrency(choice.unitPrice, choice.currency)} each
                              </p>
                            </div>
                            <input
                              type="number"
                              inputMode="numeric"
                              min={0}
                              max={choice.maxQuantity ?? MAX_UNTRACKED_QUANTITY}
                              aria-label={`Quantity for ${choice.sizeLabel}`}
                              disabled={!choice.purchasable}
                              value={quantities[choice.variantId] ?? 0}
                              onChange={(event) => {
                                changeQuantities();
                                setQuantities((current) => ({
                                  ...current,
                                  [choice.variantId]: clampQuantity(
                                    event.target.value,
                                    choice.maxQuantity
                                  ),
                                }));
                              }}
                              className="w-20 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground disabled:opacity-50"
                            />
                          </li>
                        ))}
                      </ul>
                    </div>

                    <div className="space-y-2">
                      <label
                        htmlFor="product-total-quantity"
                        className="block text-sm font-semibold text-foreground"
                      >
                        Total quantity
                      </label>
                      {/* Not an <output>: that has the `status` role of the cart message. */}
                      <input
                        id="product-total-quantity"
                        readOnly
                        value={totalQuantity}
                        className="w-40 rounded-lg border border-border bg-muted px-3 py-2 text-sm text-foreground"
                      />
                    </div>

                    {totalQuantity > 0 ? (
                      <p data-testid="selection-summary" className="text-sm text-foreground">
                        {chosen
                          .map(
                            ({ group, choice, quantity }) =>
                              `${groups.length > 1 ? `${group.label} · ` : ''}${choice.sizeLabel} × ${quantity}`
                          )
                          .join(', ')}
                      </p>
                    ) : null}
                    {totalQuantity === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Choose a quantity for at least one size.
                      </p>
                    ) : null}
                    {designId ? (
                      <div className="space-y-2">
                        <button
                          type="button"
                          onClick={() => void getPrice()}
                          disabled={totalQuantity === 0 || quoteStatus === 'loading'}
                          className="rounded-full border border-border px-6 py-3 text-sm font-semibold text-foreground disabled:opacity-60"
                        >
                          Get price
                        </button>
                        {quote ? (
                          <div className="space-y-1 text-sm text-foreground">
                            <ul className="space-y-1">
                              {chosen.map(({ choice }) => {
                                const line = quote.items.find(
                                  (entry) => entry.variantId === choice.variantId
                                );
                                return line ? (
                                  <li key={choice.variantId} className="flex justify-between gap-4">
                                    <span>
                                      {choice.sizeLabel} × {line.quantity}
                                    </span>
                                    <span>
                                      {formatCurrency(line.unitFinalPrice, quote.currency)} each
                                    </span>
                                  </li>
                                ) : null;
                              })}
                            </ul>
                            <p className="font-semibold">
                              Subtotal: {formatCurrency(quote.subtotalAmount, quote.currency)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Delivery and tax are added at checkout.
                            </p>
                          </div>
                        ) : null}
                        {quoteStatus === 'no-address' ? (
                          <p role="status" className="text-sm text-muted-foreground">
                            Add a{' '}
                            <Link
                              href="/dashboard/settings"
                              className="font-semibold text-primary hover:underline"
                            >
                              delivery address
                            </Link>{' '}
                            to see the price.
                          </p>
                        ) : null}
                        {quoteStatus === 'error' ? (
                          <p role="alert" className="text-sm text-destructive">
                            We could not get the price. Try again.
                          </p>
                        ) : null}
                      </div>
                    ) : null}
                    <div className="flex flex-wrap items-center gap-4">
                      <Button
                        type="button"
                        onClick={proceedToCheckout}
                        disabled={totalQuantity === 0}
                        className="h-11 px-6 font-semibold"
                      >
                        Proceed To Checkout
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={addToCart}
                        disabled={totalQuantity === 0}
                        className="h-11 px-6 font-semibold"
                      >
                        Add to cart
                      </Button>
                      <Link
                        href="/dashboard/cart"
                        className="text-sm font-semibold text-primary hover:underline"
                      >
                        Go to cart
                      </Link>
                    </div>
                    {cartMessage ? (
                      <p role="status" className="text-sm text-primary">
                        {cartMessage}
                      </p>
                    ) : null}
                  </>
                )}

                {designId ? null : (
                  <Button asChild variant="secondary" className="h-11 px-6 font-semibold">
                    <Link href={`/dashboard/design/new/${product.id}`}>Start Designing</Link>
                  </Button>
                )}
              </div>
            </div>

            {related.length > 0 ? (
              <section aria-labelledby="related-products-heading" className="space-y-4">
                <h2 id="related-products-heading" className="text-xl font-bold text-foreground">
                  Related products
                </h2>
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {related.map((entry) => (
                    <li key={entry.id}>
                      <Link
                        href={`/dashboard/products/${entry.id}`}
                        className="block rounded-2xl border border-border p-4 text-sm font-semibold text-foreground hover:border-primary"
                      >
                        {entry.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}
          </>
        ) : null}
      </div>
    </>
  );
}
