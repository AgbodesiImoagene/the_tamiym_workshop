'use client';

import { CustomerDashboardShell, formatCurrency } from '@/components/customer-dashboard-shell';
import { customerAssets } from '@/lib/assets';
import { ApiError, User, authApi } from '@/lib/auth';
import { addCartItem } from '@/lib/cart-store';
import { getDashboardProductDetail, getDashboardProducts } from '@/lib/products';
import { useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Tabs, TabsList, TabsTrigger } from '@tamiym/ui';

const categoryTabs = [
  'All',
  'T-Shirts',
  'Long Sleeve T-Shirts',
  'Polos',
  'Hoodies',
  'Sweatshirts',
  'Caps',
] as const;

const fallbackImages = customerAssets.productFallbacks;

const previewCards = [
  { name: 'Classic Tee', subtitle: 'Preview while catalog is being published' },
  { name: 'Premium Polo', subtitle: 'Preview while catalog is being published' },
  { name: 'Workshop Hoodie', subtitle: 'Preview while catalog is being published' },
];

const colorDots = [
  '#1497c6',
  '#c25c88',
  '#ef2557',
  '#fefefe',
  '#54b96a',
  '#4a2aa0',
  '#c48a28',
  '#3d3d3d',
];

function getCategoryLabel(name?: string | null) {
  if (!name) {
    return 'All';
  }

  const normalized = name.toLowerCase();
  const matched = categoryTabs.find((tab) =>
    tab === 'All' ? false : normalized.includes(tab.toLowerCase().replace(/s$/, ''))
  );

  return matched ?? 'All';
}

export default function DashboardProductsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<(typeof categoryTabs)[number]>('All');
  const [addingProductId, setAddingProductId] = useState<string | null>(null);
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
          setError(apiError.message || 'Failed to load user data');
        }
      }
    };

    void fetchUser();
  }, [router]);

  const productsQuery = useQuery({
    queryKey: ['dashboard-products'],
    queryFn: getDashboardProducts,
    enabled: !!user,
  });

  const filteredProducts = useMemo(() => {
    const products = productsQuery.data ?? [];
    if (activeCategory === 'All') {
      return products;
    }

    return products.filter(
      (product) => getCategoryLabel(product.category?.name) === activeCategory
    );
  }, [activeCategory, productsQuery.data]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-red-700">{error}</p>
      </div>
    );
  }

  return (
    <CustomerDashboardShell
      activeNav="products"
      displayName={user?.firstName || user?.email?.split('@')[0] || 'Borngreat'}
    >
      <div className="mt-10 space-y-8 lg:mt-0">
        <div className="space-y-5">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h1 className="text-[32px] font-bold tracking-[-0.02em] text-[rgba(0,0,0,0.86)]">
              Product List
            </h1>
            <Link
              href="/dashboard/cart"
              className="rounded-full border border-black/15 px-4 py-2 text-sm font-semibold text-black"
            >
              View cart
            </Link>
          </div>

          <div className="overflow-x-auto border-b border-black/10 pb-1">
            <Tabs
              value={activeCategory}
              onValueChange={(val) => setActiveCategory(val as typeof activeCategory)}
            >
              <TabsList
                variant="line"
                className="h-auto w-auto justify-start rounded-none bg-transparent px-0 pb-0"
              >
                {categoryTabs.map((category) => (
                  <TabsTrigger
                    key={category}
                    value={category}
                    className="rounded-none border-x-0 border-t-0 pb-2 pt-1 text-sm font-medium whitespace-nowrap data-active:border-b-[4px] data-active:border-[#1e39d2] data-active:bg-transparent data-active:text-[#1e39d2] data-active:shadow-none"
                  >
                    {category}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          {cartMessage ? <p className="text-sm text-[#004385]">{cartMessage}</p> : null}
        </div>

        {productsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading products...</p>
        ) : productsQuery.isError ? (
          <p className="text-sm text-red-700">We could not load your product catalogue.</p>
        ) : filteredProducts.length > 0 ? (
          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
            {filteredProducts.map((product, index) => {
              const price = product.prices[0];
              const imageUrl =
                product.productImageRoles[0]?.image?.url ??
                fallbackImages[index % fallbackImages.length];

              return (
                <article
                  key={product.id}
                  className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_4px_4px_rgba(0,0,0,0.12)]"
                >
                  <div className="relative h-[260px] w-full bg-[linear-gradient(180deg,#f8fbff_0%,#eef3fb_100%)]">
                    {index === 0 ? (
                      <span className="absolute left-0 top-0 z-10 rounded-br-md bg-[#004385] px-3 py-1 text-xs font-semibold text-white">
                        Best Seller
                      </span>
                    ) : null}
                    <Image
                      src={imageUrl}
                      alt={product.productImageRoles[0]?.image?.altText || product.name}
                      fill
                      className="object-contain p-5"
                      sizes="(min-width: 1280px) 305px, (min-width: 768px) 45vw, 100vw"
                    />
                  </div>

                  <div className="space-y-3 p-5">
                    <div className="flex flex-wrap gap-2">
                      {colorDots.map((color) => (
                        <span
                          key={`${product.id}-${color}`}
                          className="h-3 w-3 rounded-sm border border-black/10"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-bold">{product.name}</p>
                      <p className="text-sm text-black/80">
                        {price
                          ? `${formatCurrency(price.amount, price.currency)} each`
                          : 'Quote on request'}{' '}
                        {product.category?.name ? `for ${product.category.name}` : ''}
                      </p>
                      <p className="text-sm text-black/70">{product.description || 'No Minimum'}</p>
                    </div>
                    <div className="flex items-center gap-3 pt-2">
                      <button
                        type="button"
                        onClick={async () => {
                          setCartMessage(null);
                          setAddingProductId(product.id);
                          try {
                            const detail = await getDashboardProductDetail(product.id);
                            const variant = detail.variants.find(
                              (entry) => entry.isAvailable && entry.inStock
                            );

                            if (!variant) {
                              setCartMessage(
                                'This product does not have an available variant yet.'
                              );
                              return;
                            }

                            addCartItem({
                              productId: detail.id,
                              productName: detail.name,
                              variantId: variant.id,
                              variantName: variant.name,
                              optionSummary:
                                variant.optionValues
                                  .map(
                                    (entry) =>
                                      `${entry.option.name}: ${entry.optionValue.displayName}`
                                  )
                                  .join(' • ') || 'Default option',
                              quantity: 1,
                              unitPrice:
                                variant.resolvedPrice ??
                                detail.resolvedBasePrice ??
                                price?.amount ??
                                0,
                              currency:
                                variant.resolvedCurrency ??
                                detail.resolvedCurrency ??
                                price?.currency ??
                                'NGN',
                              imageUrl,
                            });
                            setCartMessage(`${detail.name} was added to your cart.`);
                          } catch (err) {
                            const apiError = err as ApiError;
                            setCartMessage(
                              apiError.message || 'We could not add this product to your cart.'
                            );
                          } finally {
                            setAddingProductId(null);
                          }
                        }}
                        disabled={addingProductId === product.id}
                        className="rounded-full bg-[#004385] px-4 py-2 text-xs font-semibold text-white disabled:opacity-60"
                      >
                        {addingProductId === product.id ? 'Adding...' : 'Add to cart'}
                      </button>
                      <Link href="/dashboard/cart" className="text-xs font-semibold text-[#004385]">
                        Go to cart
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <div className="space-y-5">
            <div className="rounded-[24px] border border-dashed border-black/20 bg-[#f8fbff] px-5 py-4 text-sm text-black/70">
              Your catalog is connected, but no published products are available for this view yet.
            </div>
            <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
              {previewCards.map((card, index) => (
                <article
                  key={card.name}
                  className="overflow-hidden rounded-[28px] border border-black/10 bg-white shadow-[0_4px_4px_rgba(0,0,0,0.12)]"
                >
                  <div className="relative h-[260px] w-full bg-[linear-gradient(180deg,#f8fbff_0%,#eef3fb_100%)]">
                    <Image
                      src={fallbackImages[index % fallbackImages.length]}
                      alt={card.name}
                      fill
                      className="object-contain p-5 opacity-90"
                      sizes="(min-width: 1280px) 305px, (min-width: 768px) 45vw, 100vw"
                    />
                    <span className="absolute left-4 top-4 rounded-full bg-white/90 px-3 py-1 text-xs font-semibold text-[#004385]">
                      Preview
                    </span>
                  </div>
                  <div className="space-y-2 p-5">
                    <p className="text-base font-bold">{card.name}</p>
                    <p className="text-sm text-black/70">{card.subtitle}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        )}
      </div>
    </CustomerDashboardShell>
  );
}
