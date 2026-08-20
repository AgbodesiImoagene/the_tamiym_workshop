'use client';

import { AdminShell } from '@/components/admin-shell';
import { createAdminProduct, getAdminCategoryList } from '@/lib/products';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
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
import { useMemo, useState } from 'react';

export default function AdminNewProductPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const categoriesQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: getAdminCategoryList,
  });

  const defaultCategoryId = useMemo(
    () => categoriesQuery.data?.[0]?.id ?? '',
    [categoriesQuery.data]
  );

  const [categoryId, setCategoryId] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'ACTIVE' | 'ARCHIVED'>('DRAFT');
  const [error, setError] = useState<string | null>(null);

  const effectiveCategoryId = categoryId || defaultCategoryId;

  const createMutation = useMutation({
    mutationFn: () =>
      createAdminProduct({
        categoryId: effectiveCategoryId,
        name: name.trim(),
        slug: slug.trim() || undefined,
        description: description.trim() || undefined,
        status,
      }),
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({ queryKey: ['admin-products-full'] });
      router.push(`/admin/catalog/products/${data.id}`);
    },
    onError: (e: Error & { message?: string }) => {
      setError(e.message || 'Could not create product.');
    },
  });

  return (
    <AdminShell
      activeNav="catalog"
      title="New product"
      description="Create a draft product, then open workshop setup to add views and template layers."
      actions={
        <Link href="/admin/catalog/products">
          <Button variant="ghost" size="sm">
            ← Products
          </Button>
        </Link>
      }
    >
      <Card className="max-w-xl rounded-[1.75rem] border-border shadow-xs">
        <CardHeader>
          <CardTitle>Basics</CardTitle>
          <CardDescription>
            Slug is optional; one is generated from the name if omitted.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {categoriesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading categories…</p>
          ) : !categoriesQuery.data?.length ? (
            <p className="text-sm text-red-600">
              Add a category first in{' '}
              <Link href="/admin/catalog/categories" className="underline">
                Catalog → Categories
              </Link>
              .
            </p>
          ) : (
            <>
              <div className="space-y-2">
                <Label htmlFor="np-cat">Category</Label>
                <Select value={effectiveCategoryId} onValueChange={setCategoryId}>
                  <SelectTrigger id="np-cat" className="h-11 w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoriesQuery.data.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="np-name">Name</Label>
                <Input
                  id="np-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Classic crewneck"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="np-slug">Slug (optional)</Label>
                <Input
                  id="np-slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  placeholder="classic-crewneck"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="np-desc">Description</Label>
                <Textarea
                  id="np-desc"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="np-status">Status</Label>
                <Select value={status} onValueChange={(val) => setStatus(val as typeof status)}>
                  <SelectTrigger id="np-status" className="h-11 w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DRAFT">Draft</SelectItem>
                    <SelectItem value="ACTIVE">Active</SelectItem>
                    <SelectItem value="ARCHIVED">Archived</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {error ? <p className="text-sm text-red-600">{error}</p> : null}
              <Button
                type="button"
                disabled={createMutation.isPending || !name.trim() || !effectiveCategoryId}
                onClick={() => createMutation.mutate()}
              >
                {createMutation.isPending ? 'Creating…' : 'Create product'}
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </AdminShell>
  );
}
