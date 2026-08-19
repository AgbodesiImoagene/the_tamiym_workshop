'use client';

import { AdminShell } from '@/components/admin-shell';
import { getAdminProductList, type AdminProductSummary } from '@/lib/products';
import { Badge, Button, Card, CardContent, EmptyState } from '@tamiym/ui';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';

const STATUS_BADGE: Record<
  string,
  { variant: 'brand' | 'accent' | 'neutral' | 'danger'; label: string }
> = {
  ACTIVE: { variant: 'accent', label: 'Active' },
  DRAFT: { variant: 'neutral', label: 'Draft' },
  ARCHIVED: { variant: 'danger', label: 'Archived' },
};

function ProductRow({ product }: { product: AdminProductSummary }) {
  const badge = STATUS_BADGE[product.status] ?? {
    variant: 'neutral' as const,
    label: product.status,
  };
  const thumbUrl =
    product.thumbnailUrl ??
    `https://placehold.co/56x56/f3f4f6/9ca3af?text=${encodeURIComponent(product.name[0] ?? '?')}`;

  return (
    <div className="flex items-center gap-4 rounded-2xl border border-border bg-white px-5 py-4 shadow-xs transition-shadow hover:shadow-sm">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-gray-100">
        <img src={thumbUrl} alt={product.name} className="h-full w-full object-cover" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
          <Badge variant={badge.variant}>{badge.label}</Badge>
        </div>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {product.slug}
          {product.category ? ` · ${product.category.name}` : ''}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {product._count.views} view{product._count.views !== 1 ? 's' : ''} ·{' '}
          {product._count.variants} variant{product._count.variants !== 1 ? 's' : ''}
        </p>
      </div>

      <Link href={`/admin/catalog/products/${product.id}`}>
        <Button variant="secondary" size="sm">
          Workshop setup
        </Button>
      </Link>
    </div>
  );
}

export default function AdminCatalogProductsPage() {
  const productsQuery = useQuery({
    queryKey: ['admin-products-full'],
    queryFn: getAdminProductList,
  });

  return (
    <AdminShell
      activeNav="catalog"
      title="Products"
      description="Manage product views, workshop layers, and print areas."
    >
      <div className="space-y-3">
        {productsQuery.isLoading ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-muted-foreground">
              Loading products…
            </CardContent>
          </Card>
        ) : productsQuery.isError ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-red-600">
              Failed to load products. Check your connection and try again.
            </CardContent>
          </Card>
        ) : productsQuery.data && productsQuery.data.length > 0 ? (
          productsQuery.data.map((product) => <ProductRow key={product.id} product={product} />)
        ) : (
          <EmptyState title="No products yet" description="Products you create will appear here." />
        )}
      </div>
    </AdminShell>
  );
}
