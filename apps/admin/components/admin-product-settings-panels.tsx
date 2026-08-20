'use client';

/* eslint-disable react-hooks/set-state-in-effect -- Product changes intentionally reset the local settings editor. */

import {
  deleteAdminProduct,
  getAdminCategoryList,
  updateAdminProduct,
  type AdminProductDetail,
} from '@/lib/products';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  ConfirmDialog,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@tamiym/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

type ProductForm = {
  name: string;
  slug: string;
  description: string;
  status: string;
  categoryId: string;
};

export function ProductSettingsPanel({
  product,
  onUpdated,
}: {
  product: AdminProductDetail;
  onUpdated: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: getAdminCategoryList,
  });

  const [form, setForm] = useState<ProductForm>(() => ({
    name: product.name,
    slug: product.slug,
    description: product.description ?? '',
    status: product.status,
    categoryId: product.category?.id ?? '',
  }));

  useEffect(() => {
    setForm({
      name: product.name,
      slug: product.slug,
      description: product.description ?? '',
      status: product.status,
      categoryId: product.category?.id ?? '',
    });
  }, [product]);

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () =>
      updateAdminProduct(product.id, {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        description: form.description.trim() || undefined,
        status: form.status as AdminProductDetail['status'],
        categoryId: form.categoryId || undefined,
      }),
    onSuccess: async () => {
      setMessage('Product saved.');
      setError(null);
      await queryClient.invalidateQueries({ queryKey: ['admin-products-full'] });
      onUpdated();
    },
    onError: (e: Error & { message?: string }) => {
      setError(e.message || 'Save failed.');
      setMessage(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAdminProduct(product.id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-products-full'] });
      router.push('/admin/catalog/products');
    },
    onError: (e: Error & { message?: string }) => {
      setError(e.message || 'Delete failed.');
      setMessage(null);
    },
  });

  function confirmDelete() {
    setConfirmDeleteOpen(true);
  }

  return (
    <>
      <Card className="rounded-[1.75rem] border-border shadow-xs">
        <CardHeader>
          <CardTitle>Product details</CardTitle>
          <CardDescription>Name, slug, category, and lifecycle status.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prod-name">Name</Label>
              <Input
                id="prod-name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-slug">Slug</Label>
              <Input
                id="prod-slug"
                value={form.slug}
                onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value }))}
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prod-desc">Description</Label>
            <Textarea
              id="prod-desc"
              rows={3}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />
          </div>
          {categoriesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading categories…</p>
          ) : !categoriesQuery.data?.length ? (
            <p className="text-sm text-red-600">
              Add a category in{' '}
              <Link href="/admin/catalog/categories" className="underline">
                Catalog → Categories
              </Link>{' '}
              before editing this product.
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="prod-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(val) => setForm((f) => ({ ...f, status: val }))}
              >
                <SelectTrigger id="prod-status" className="h-11 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="DRAFT">Draft</SelectItem>
                  <SelectItem value="ACTIVE">Active</SelectItem>
                  <SelectItem value="ARCHIVED">Archived</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="prod-cat">Category</Label>
              <Select
                value={form.categoryId}
                onValueChange={(val) => setForm((f) => ({ ...f, categoryId: val }))}
                disabled={!categoriesQuery.data?.length}
              >
                <SelectTrigger id="prod-cat" className="h-11 w-full rounded-xl">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(categoriesQuery.data ?? []).map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {message ? <p className="text-sm text-green-700">{message}</p> : null}
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              onClick={() => saveMutation.mutate()}
              disabled={
                saveMutation.isPending ||
                !form.name.trim() ||
                !form.categoryId ||
                !categoriesQuery.data?.length
              }
            >
              {saveMutation.isPending ? 'Saving…' : 'Save product'}
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting…' : 'Delete product'}
            </Button>
            <Link href="/admin/catalog/categories">
              <Button type="button" variant="ghost" size="sm">
                Manage categories
              </Button>
            </Link>
          </div>
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`Delete product?`}
        description={`Delete "${product.name}"? This only succeeds if the product has no orders or designs.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => deleteMutation.mutate()}
      />
    </>
  );
}
