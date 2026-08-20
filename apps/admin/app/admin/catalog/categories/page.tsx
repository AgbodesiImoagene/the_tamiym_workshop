'use client';

import { AdminShell, formatAdminDate } from '@/components/admin-shell';
import {
  createAdminCategory,
  deleteAdminCategory,
  getAdminCategoryList,
  updateAdminCategory,
  type AdminCategory,
} from '@/lib/products';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  Skeleton,
  Textarea,
} from '@tamiym/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';

type CategoryFormState = {
  name: string;
  slug: string;
  description: string;
};

const emptyForm: CategoryFormState = {
  name: '',
  slug: '',
  description: '',
};

function toFormState(category: AdminCategory): CategoryFormState {
  return {
    name: category.name,
    slug: category.slug,
    description: category.description ?? '',
  };
}

export default function AdminCatalogCategoriesPage() {
  const queryClient = useQueryClient();
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(null);
  const [form, setForm] = useState<CategoryFormState>(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const categoriesQuery = useQuery({
    queryKey: ['admin-categories'],
    queryFn: getAdminCategoryList,
  });

  const selectedCategory = useMemo(
    () => categoriesQuery.data?.find((category) => category.id === selectedCategoryId) ?? null,
    [categoriesQuery.data, selectedCategoryId]
  );

  const upsertMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name: form.name.trim(),
        slug: form.slug.trim() || undefined,
        description: form.description.trim() || undefined,
      };

      if (selectedCategoryId) {
        return updateAdminCategory(selectedCategoryId, payload);
      }

      return createAdminCategory(payload);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      setMessage(selectedCategoryId ? 'Category updated.' : 'Category created.');
      setError(null);
      if (!selectedCategoryId) {
        setForm(emptyForm);
      }
    },
    onError: (mutationError: { message?: string }) => {
      setError(mutationError.message || 'We could not save the category.');
      setMessage(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminCategory(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-categories'] });
      setMessage('Category deleted.');
      setError(null);
      setSelectedCategoryId(null);
      setForm(emptyForm);
    },
    onError: (mutationError: { message?: string }) => {
      setError(mutationError.message || 'We could not delete the category.');
      setMessage(null);
    },
  });

  function beginCreate() {
    setSelectedCategoryId(null);
    setForm(emptyForm);
    setMessage(null);
    setError(null);
  }

  function beginEdit(category: AdminCategory) {
    setSelectedCategoryId(category.id);
    setForm(toFormState(category));
    setMessage(null);
    setError(null);
  }

  return (
    <AdminShell
      activeNav="catalog"
      title="Categories"
      description="Manage the catalog groupings that products roll up under in admin and storefront filtering."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="rounded-[1.75rem] border-black/8 shadow-none">
          <CardHeader>
            <CardTitle>Category list</CardTitle>
            <CardDescription>
              Categories are used for product organization and storefront browsing.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {categoriesQuery.isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-2xl" />
                ))}
              </div>
            ) : categoriesQuery.isError ? (
              <p className="text-sm text-red-700">We could not load categories right now.</p>
            ) : categoriesQuery.data && categoriesQuery.data.length > 0 ? (
              categoriesQuery.data.map((category) => {
                const active = category.id === selectedCategoryId;

                return (
                  <div
                    key={category.id}
                    className={`rounded-2xl border px-5 py-4 transition ${
                      active
                        ? 'border-primary bg-primary-50/40'
                        : 'border-black/8 bg-white hover:border-primary/25'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <p className="text-sm font-semibold text-tamiym-blue">{category.name}</p>
                        <p className="text-xs text-black/55">{category.slug}</p>
                        <p className="text-xs text-black/45">
                          Updated {formatAdminDate(category.updatedAt)}
                        </p>
                      </div>
                      <Button variant="secondary" size="sm" onClick={() => beginEdit(category)}>
                        Edit
                      </Button>
                    </div>
                    <p className="mt-3 text-sm leading-6 text-black/65">
                      {category.description || 'No description yet.'}
                    </p>
                  </div>
                );
              })
            ) : (
              <EmptyState
                title="No categories yet"
                description="Create the first category so products can be grouped properly."
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[1.75rem] border-black/8 shadow-none">
            <CardHeader>
              <CardTitle>{selectedCategory ? 'Edit category' : 'Create category'}</CardTitle>
              <CardDescription>
                Slugs are optional. If you leave one blank, the backend will generate it from the
                name.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, name: event.target.value }))
                  }
                  placeholder="e.g. T-Shirts"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="slug">Slug</Label>
                <Input
                  id="slug"
                  value={form.slug}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, slug: event.target.value }))
                  }
                  placeholder="e.g. t-shirts"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={form.description}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, description: event.target.value }))
                  }
                  placeholder="Short storefront-facing description"
                />
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  className="w-full"
                  onClick={() => {
                    setMessage(null);
                    setError(null);
                    upsertMutation.mutate();
                  }}
                  disabled={upsertMutation.isPending || !form.name.trim()}
                >
                  {upsertMutation.isPending
                    ? 'Saving...'
                    : selectedCategory
                      ? 'Save category'
                      : 'Create category'}
                </Button>
                <Button variant="ghost" className="w-full" onClick={beginCreate}>
                  Clear form
                </Button>
                {selectedCategory ? (
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={() => {
                      setMessage(null);
                      setError(null);
                      deleteMutation.mutate(selectedCategory.id);
                    }}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? 'Deleting...' : 'Delete category'}
                  </Button>
                ) : null}
              </div>

              {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
              {error ? <p className="text-sm text-red-700">{error}</p> : null}
            </CardContent>
          </Card>

          <Card className="rounded-[1.75rem] border-black/8 shadow-none">
            <CardHeader>
              <CardTitle>Operational note</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-black/65">
              <p>Deletion is blocked by the API when products still reference a category.</p>
              <p>
                Edit the category first, or reassign linked products in the products workspace
                before deleting it.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
