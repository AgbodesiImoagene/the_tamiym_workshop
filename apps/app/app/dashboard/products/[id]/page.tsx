'use client';

import { CustomerDashboardShell, formatCurrency } from '@/components/customer-dashboard-shell';
import { customerAssets } from '@/lib/assets';
import { ApiError, User, authApi } from '@/lib/auth';
import { addCartItem } from '@/lib/cart-store';
import { groupVariantsByColor, imagesForColor } from '@/lib/product-variants';
import { getDashboardProductDetail, getDashboardProducts } from '@/lib/products';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';

const MAX_UNTRACKED_QUANTITY = 999;
const MAX_RELATED_PRODUCTS = 4;
const fallbackImages = customerAssets.productFallbacks;

function clampQuantity(raw: string, max: number | null) {
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 0) return 0;
  return Math.min(parsed, max ?? MAX_UNTRACKED_QUANTITY);
}

/** Remounts per product so a related-product link starts with a clean selection. */
export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  return <ProductDetailContent key={params.id} productId={params.id} />;
}

function ProductDetailContent({ productId }: { productId: string }) {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [cartMessage, setCartMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        setUser(await authApi.getMe());
      } catch (err) {
        const apiError = err as ApiError;
        if (apiError.statusCode === 401) {
          router.push('/auth/login');
        } else {
          setAuthError(apiError.message || 'Failed to load user data');
        }
      }
    };

    void fetchUser();
  }, [router]);

  const productQuery = useQuery({
    queryKey: ['dashboard-product', productId],
    queryFn: () => getDashboardProductDetail(productId),
    enabled: !!user && !!productId,
    retry: false,
  });
  const listQuery = useQuery({
    queryKey: ['dashboard-products'],
    queryFn: getDashboardProducts,
    enabled: !!user,
  });

  const product = productQuery.data;
  const groups = useMemo(() => (product ? groupVariantsByColor(product) : []), [product]);
  const activeGroup = groups.find((group) => group.code === selectedColor) ?? groups[0];
  const images = useMemo(
    () => (product && activeGroup ? imagesForColor(product, activeGroup) : []),
    [product, activeGroup]
  );
  const mainImage = images[selectedImage] ?? images[0];
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
    for (const { group, choice, quantity } of chosen) {
      addCartItem({
        productId: product.id,
        productName: product.name,
        variantId: choice.variantId,
        variantName: choice.variantName,
        optionSummary: choice.optionSummary,
        quantity,
        unitPrice: choice.unitPrice,
        currency: choice.currency,
        imageUrl: imagesForColor(product, group)[0]?.url ?? null,
      });
    }
    setQuantities({});
    setCartMessage(
      totalQuantity === 1
        ? '1 item was added to your cart.'
        : `${totalQuantity} items were added to your cart.`
    );
  };

  const displayName = user?.firstName || user?.email?.split('@')[0] || 'Borngreat';

  if (authError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-destructive">{authError}</p>
      </div>
    );
  }

  const productError = productQuery.error as ApiError | null;

  return (
    <CustomerDashboardShell activeNav="products" displayName={displayName}>
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
                  <Image
                    src={mainImage?.url ?? fallbackImages[0]}
                    alt={mainImage?.altText || product.name}
                    fill
                    className="object-contain p-5"
                    sizes="(min-width: 1024px) 45vw, 100vw"
                  />
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
                  <h1 className="text-[32px] font-bold tracking-[-0.02em] text-foreground">
                    {product.name}
                  </h1>
                  {product.category?.name ? (
                    <p className="text-sm text-muted-foreground">{product.category.name}</p>
                  ) : null}
                  {product.description ? (
                    <p className="text-sm text-foreground/80">{product.description}</p>
                  ) : null}
                </div>

                {!canBuy ? (
                  <p className="rounded-2xl border border-dashed border-border px-5 py-4 text-sm text-muted-foreground">
                    This product is not available to order yet.
                  </p>
                ) : (
                  <>
                    {groups.length > 1 ? (
                      <div className="space-y-2">
                        <p className="text-sm font-semibold text-foreground">Colour</p>
                        <div className="flex flex-wrap gap-2">
                          {groups.map((group) => (
                            <button
                              key={group.code}
                              type="button"
                              aria-pressed={group.code === activeGroup?.code}
                              onClick={() => {
                                setSelectedColor(group.code);
                                setSelectedImage(0);
                              }}
                              className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground aria-pressed:border-primary aria-pressed:bg-primary aria-pressed:text-primary-foreground"
                            >
                              {group.label}
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
                                setCartMessage(null);
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
                    <div className="flex flex-wrap items-center gap-4">
                      <button
                        type="button"
                        onClick={addToCart}
                        disabled={totalQuantity === 0}
                        className="rounded-full bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground disabled:opacity-60"
                      >
                        Add to cart
                      </button>
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
    </CustomerDashboardShell>
  );
}
