'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { CustomerDashboardShell } from '@/components/customer-dashboard-shell';
import { authApi, type ApiError, type User } from '@/lib/auth';
import { getMyDesigns, deleteDesign, duplicateDesign, type Design } from '@/lib/designs';
import { getDashboardProducts } from '@/lib/products';
import { Badge, Button } from '@tamiym/ui';

type BadgeVariant = 'brand' | 'accent' | 'neutral' | 'danger';

const MODERATION_BADGE: Record<string, { label: string; variant: BadgeVariant }> = {
  APPROVED: { label: 'Approved', variant: 'brand' },
  PENDING: { label: 'Pending review', variant: 'neutral' },
  FLAGGED: { label: 'Flagged', variant: 'accent' },
  REJECTED: { label: 'Rejected', variant: 'danger' },
};

export default function DashboardDesignPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    authApi
      .getMe()
      .then(setUser)
      .catch((err: ApiError) => {
        if (err.statusCode === 401) router.push('/auth/login');
        else setError(err.message || 'Failed to load user');
      });
  }, [router]);

  const designsQuery = useQuery({
    queryKey: ['my-designs'],
    queryFn: getMyDesigns,
    enabled: !!user,
  });

  const productsQuery = useQuery({
    queryKey: ['dashboard-products-design'],
    queryFn: getDashboardProducts,
    enabled: !!user,
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDesign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-designs'] }),
  });

  const duplicateMutation = useMutation({
    mutationFn: (id: string) => duplicateDesign(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['my-designs'] }),
  });

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }

  const designs: Design[] = designsQuery.data ?? [];
  const products = productsQuery.data ?? [];

  return (
    <CustomerDashboardShell
      activeNav="design"
      displayName={user?.firstName || user?.email?.split('@')[0] || ''}
    >
      <div className="space-y-10">
        {/* Hero */}
        <div className="rounded-3xl border border-black/10 bg-gradient-to-br from-blue-50 to-white p-8 shadow-sm">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900">Design Workshop</h1>
          <p className="mt-2 text-zinc-600">Create, customise, and manage your product designs.</p>
        </div>

        {/* My Designs */}
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-xl font-bold text-zinc-900">My Designs</h2>
          </div>

          {designsQuery.isLoading ? (
            <p className="text-sm text-zinc-500">Loading designs…</p>
          ) : designs.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
              <p className="text-sm text-zinc-500">
                You have no designs yet. Start by choosing a product below.
              </p>
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {designs.map((design) => {
                const moderation =
                  MODERATION_BADGE[design.moderationStatus] ?? MODERATION_BADGE.PENDING;

                return (
                  <article
                    key={design.id}
                    className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
                  >
                    {/* Thumbnail */}
                    <div className="relative h-48 bg-zinc-100">
                      {design.thumbnailUrl ? (
                        <Image
                          src={design.thumbnailUrl}
                          alt={design.name}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-zinc-400 text-sm">
                          No preview
                        </div>
                      )}
                    </div>

                    {/* Meta */}
                    <div className="space-y-2 p-4">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-semibold text-zinc-900 line-clamp-1">{design.name}</p>
                        <Badge variant={moderation.variant}>{moderation.label}</Badge>
                      </div>
                      <p className="text-xs text-zinc-500">{design.product.name}</p>

                      {/* Actions */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <Link
                          href={`/dashboard/design/${design.id}/edit`}
                          className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-700"
                        >
                          Edit
                        </Link>
                        <button
                          type="button"
                          onClick={() => duplicateMutation.mutate(design.id)}
                          disabled={duplicateMutation.isPending}
                          className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
                        >
                          Duplicate
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (confirm(`Delete "${design.name}"? This cannot be undone.`)) {
                              deleteMutation.mutate(design.id);
                            }
                          }}
                          disabled={deleteMutation.isPending}
                          className="rounded-lg border border-red-200 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        {/* Start from a product */}
        <section>
          <h2 className="mb-4 text-xl font-bold text-zinc-900">Start from a product</h2>

          {productsQuery.isLoading ? (
            <p className="text-sm text-zinc-500">Loading products…</p>
          ) : products.length === 0 ? (
            <p className="text-sm text-zinc-500">No products available.</p>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {products.slice(0, 6).map((product) => {
                const imageUrl = product.productImageRoles[0]?.image?.url ?? null;
                const price = product.prices[0];

                return (
                  <article
                    key={product.id}
                    className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
                  >
                    <div className="relative h-48 bg-zinc-100">
                      {imageUrl ? (
                        <Image src={imageUrl} alt={product.name} fill className="object-cover" />
                      ) : (
                        <div className="flex h-full items-center justify-center text-zinc-400 text-sm">
                          No image
                        </div>
                      )}
                    </div>
                    <div className="space-y-2 p-4">
                      <p className="font-semibold text-zinc-900">{product.name}</p>
                      {price && (
                        <p className="text-xs text-zinc-500">
                          From{' '}
                          {new Intl.NumberFormat('en-NG', {
                            style: 'currency',
                            currency: price.currency,
                          }).format(price.amount / 100)}
                        </p>
                      )}
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => router.push(`/dashboard/design/new/${product.id}`)}
                      >
                        Design this product
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </CustomerDashboardShell>
  );
}
