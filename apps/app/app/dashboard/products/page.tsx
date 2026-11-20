'use client';

import { CustomerDashboardShell, formatCurrency } from '@/components/customer-dashboard-shell';
import { customerAssets } from '@/lib/assets';
import { ApiError, User, authApi } from '@/lib/auth';
import {
  type DashboardProduct,
  getDashboardCategories,
  getDashboardProducts,
} from '@/lib/products';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Tabs, TabsList, TabsTrigger } from '@tamiym/ui';

// Not a valid slug, so it can never collide with a real category.
const ALL_CATEGORIES = '__all__';
const PAGE_SIZE = 12;

const fallbackImages = customerAssets.productFallbacks;

const previewCards = [
  { name: 'Classic Tee', subtitle: 'Preview while catalog is being published' },
  { name: 'Premium Polo', subtitle: 'Preview while catalog is being published' },
  { name: 'Workshop Hoodie', subtitle: 'Preview while catalog is being published' },
];

/** From the real bulk tier when there is one, else the base price, else a quote. Display only. */
function priceLine(product: DashboardProduct) {
  const price = product.prices[0];
  if (!price) return 'Quote on request';
  if (product.bulkTier) {
    const { pricePerUnit, minQuantity } = product.bulkTier;
    return `${formatCurrency(pricePerUnit, price.currency)} each for ${minQuantity} items`;
  }
  return `${formatCurrency(price.amount, price.currency)} each`;
}

export default function DashboardProductsPage() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string>(ALL_CATEGORIES);
  const [page, setPage] = useState(0);

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

  const categoriesQuery = useQuery({
    queryKey: ['dashboard-categories'],
    queryFn: getDashboardCategories,
    enabled: !!user,
  });

  const categorySlug = activeCategory === ALL_CATEGORIES ? undefined : activeCategory;

  // The API returns no total: ask for one extra product to know whether a next page exists.
  const productsQuery = useQuery({
    queryKey: ['dashboard-products', categorySlug ?? ALL_CATEGORIES, page],
    queryFn: () =>
      getDashboardProducts({ categorySlug, limit: PAGE_SIZE + 1, offset: page * PAGE_SIZE }),
    enabled: !!user,
    placeholderData: keepPreviousData,
  });

  const fetchedProducts = productsQuery.data ?? [];
  const filteredProducts = fetchedProducts.slice(0, PAGE_SIZE);
  const hasNextPage = fetchedProducts.length > PAGE_SIZE;

  const selectCategory = (value: string) => {
    setActiveCategory(value);
    setPage(0);
  };

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
            <Tabs value={activeCategory} onValueChange={selectCategory}>
              <TabsList
                variant="line"
                className="h-auto w-auto justify-start rounded-none bg-transparent px-0 pb-0"
              >
                {[
                  { id: ALL_CATEGORIES, name: 'All', slug: ALL_CATEGORIES },
                  ...(categoriesQuery.data ?? []),
                ].map((category) => (
                  <TabsTrigger
                    key={category.id}
                    value={category.slug}
                    className="rounded-none border-x-0 border-t-0 pb-2 pt-1 text-sm font-medium whitespace-nowrap data-active:border-b-[4px] data-active:border-[#1e39d2] data-active:bg-transparent data-active:text-[#1e39d2] data-active:shadow-none"
                  >
                    {category.name}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
          {categoriesQuery.isError ? (
            <p className="text-sm text-red-700">We could not load the categories.</p>
          ) : null}
        </div>

        {productsQuery.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading products...</p>
        ) : productsQuery.isError ? (
          <p className="text-sm text-red-700">We could not load your product catalogue.</p>
        ) : filteredProducts.length > 0 ? (
          <div className="space-y-8">
            <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
              {filteredProducts.map((product, index) => {
                const imageUrl =
                  product.productImageRoles[0]?.image?.url ??
                  fallbackImages[index % fallbackImages.length];

                return (
                  <article key={product.id} className="overflow-hidden bg-background">
                    <div className="relative h-[260px] w-full bg-[linear-gradient(180deg,#f8fbff_0%,#eef3fb_100%)]">
                      <Image
                        src={imageUrl}
                        alt={product.productImageRoles[0]?.image?.altText || product.name}
                        fill
                        className="object-contain p-5"
                        sizes="(min-width: 1280px) 305px, (min-width: 768px) 45vw, 100vw"
                      />
                    </div>

                    <div className="space-y-3 px-1 py-4">
                      {product.colors && product.colors.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {product.colors.map((color) => (
                            <span
                              key={`${product.id}-${color.code}`}
                              data-testid="product-colour"
                              role="img"
                              aria-label={color.name}
                              title={color.name}
                              className="h-3 w-3 rounded-sm border border-border bg-muted"
                              style={color.hex ? { backgroundColor: color.hex } : undefined}
                            />
                          ))}
                        </div>
                      ) : null}
                      <div className="space-y-1">
                        <p className="text-base font-bold">{product.name}</p>
                        {product.sizeRange ? (
                          <p className="text-sm text-black/70">{product.sizeRange}</p>
                        ) : null}
                        <p className="text-sm text-black/80">{priceLine(product)}</p>
                        <p className="text-sm text-black/70">No Minimum</p>
                      </div>
                      <div className="flex items-center gap-3 pt-2">
                        <Link
                          href={`/dashboard/products/${product.id}`}
                          className="rounded-full bg-[#004385] px-4 py-2 text-xs font-semibold text-white"
                        >
                          View product
                        </Link>
                        <Link
                          href="/dashboard/cart"
                          className="text-xs font-semibold text-[#004385]"
                        >
                          Go to cart
                        </Link>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
            {page > 0 || hasNextPage ? (
              <nav aria-label="Pagination" className="flex items-center justify-center gap-4">
                <Button
                  type="button"
                  variant="outline"
                  disabled={page === 0}
                  onClick={() => setPage((current) => current - 1)}
                >
                  Previous page
                </Button>
                <span className="text-sm text-muted-foreground">Page {page + 1}</span>
                <Button
                  type="button"
                  variant="outline"
                  disabled={!hasNextPage}
                  onClick={() => setPage((current) => current + 1)}
                >
                  Next page
                </Button>
              </nav>
            ) : null}
          </div>
        ) : activeCategory !== ALL_CATEGORIES || page > 0 ? (
          <div className="rounded-[24px] border border-dashed border-black/20 bg-[#f8fbff] px-5 py-4 text-sm text-black/70">
            {page > 0
              ? 'There are no more products on this page.'
              : 'No products in this category yet.'}
            {page > 0 ? (
              <Button type="button" variant="outline" className="ml-3" onClick={() => setPage(0)}>
                Back to first page
              </Button>
            ) : null}
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
