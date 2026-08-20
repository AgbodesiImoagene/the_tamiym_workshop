'use client';

/* eslint-disable react-hooks/set-state-in-effect -- Selection changes intentionally reset the tier editor. */

import { AdminShell, formatAdminCurrency, formatAdminDate } from '@/components/admin-shell';
import {
  createAdminBulkPricing,
  deleteAdminBulkPricing,
  getAdminBulkPricing,
  getAdminProductVariants,
  updateAdminBulkPricing,
  type AdminBulkPricingTier,
} from '@/lib/pricing';
import { getAdminProductList } from '@/lib/products';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tamiym/ui';
import { CurrencyCode } from '@tamiym/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

type TierFormState = {
  productId: string;
  variantId: string;
  currency: CurrencyCode;
  minQuantity: string;
  maxQuantity: string;
  pricePerUnit: string;
};

const emptyForm: TierFormState = {
  productId: '',
  variantId: '',
  currency: CurrencyCode.NGN,
  minQuantity: '',
  maxQuantity: '',
  pricePerUnit: '',
};

function toFormState(tier: AdminBulkPricingTier): TierFormState {
  return {
    productId: tier.productId,
    variantId: tier.variantId ?? '',
    currency: tier.currency,
    minQuantity: String(tier.minQuantity),
    maxQuantity: tier.maxQuantity != null ? String(tier.maxQuantity) : '',
    pricePerUnit: String(Number(tier.pricePerUnit)),
  };
}

function formatQuantityRange(tier: AdminBulkPricingTier) {
  return tier.maxQuantity != null
    ? `${tier.minQuantity} to ${tier.maxQuantity} units`
    : `${tier.minQuantity}+ units`;
}

function TierRow({
  tier,
  selected,
  onSelect,
}: {
  tier: AdminBulkPricingTier;
  selected: boolean;
  onSelect: (tier: AdminBulkPricingTier) => void;
}) {
  return (
    <div
      className={`rounded-2xl border px-5 py-4 ${
        selected ? 'border-primary bg-primary-50/40' : 'border-border bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-primary">{tier.product.name}</p>
            {tier.variant ? <Badge variant="brand">{tier.variant.name}</Badge> : null}
          </div>
          <p className="text-sm text-foreground">{formatQuantityRange(tier)}</p>
          <p className="text-sm text-foreground">
            {formatAdminCurrency(Number(tier.pricePerUnit), tier.currency)} per unit
          </p>
          <p className="text-xs text-muted-foreground">Updated {formatAdminDate(tier.updatedAt)}</p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => onSelect(tier)}>
          Edit
        </Button>
      </div>
    </div>
  );
}

export default function AdminBulkPricingPage() {
  const queryClient = useQueryClient();
  const [selectedTierId, setSelectedTierId] = useState<string | null>(null);
  const [filterProductId, setFilterProductId] = useState('');
  const [form, setForm] = useState<TierFormState>(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const tiersQuery = useQuery({
    queryKey: ['admin-bulk-pricing', filterProductId],
    queryFn: () => getAdminBulkPricing(filterProductId || undefined),
  });
  const productsQuery = useQuery({
    queryKey: ['admin-products-list'],
    queryFn: getAdminProductList,
  });
  const variantsQuery = useQuery({
    queryKey: ['admin-product-variants', form.productId],
    queryFn: () => getAdminProductVariants(form.productId),
    enabled: Boolean(form.productId),
  });

  const selectedTier = useMemo(
    () => tiersQuery.data?.find((tier) => tier.id === selectedTierId) ?? null,
    [tiersQuery.data, selectedTierId]
  );

  useEffect(() => {
    if (selectedTier) {
      setForm(toFormState(selectedTier));
      return;
    }
    setForm(emptyForm);
  }, [selectedTier]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (selectedTier) {
        return updateAdminBulkPricing(selectedTier.id, {
          minQuantity: Number(form.minQuantity),
          maxQuantity: form.maxQuantity ? Number(form.maxQuantity) : null,
          pricePerUnit: Number(form.pricePerUnit),
        });
      }

      return createAdminBulkPricing({
        productId: form.productId,
        variantId: form.variantId || undefined,
        currency: form.currency,
        minQuantity: Number(form.minQuantity),
        maxQuantity: form.maxQuantity ? Number(form.maxQuantity) : undefined,
        pricePerUnit: Number(form.pricePerUnit),
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-bulk-pricing'] });
      setMessage(selectedTier ? 'Bulk pricing tier updated.' : 'Bulk pricing tier created.');
      setError(null);
      if (!selectedTier) {
        setForm(emptyForm);
      }
    },
    onError: (mutationError: { message?: string }) => {
      setError(mutationError.message || 'We could not save the bulk pricing tier.');
      setMessage(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteAdminBulkPricing(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-bulk-pricing'] });
      setSelectedTierId(null);
      setForm(emptyForm);
      setMessage('Bulk pricing tier deleted.');
      setError(null);
    },
    onError: (mutationError: { message?: string }) => {
      setError(mutationError.message || 'We could not delete the bulk pricing tier.');
      setMessage(null);
    },
  });

  function beginCreate() {
    setSelectedTierId(null);
    setForm(emptyForm);
    setMessage(null);
    setError(null);
  }

  return (
    <AdminShell
      activeNav="pricing"
      title="Bulk pricing"
      description="Manage non-overlapping quantity tiers for products and variants so standard checkout can apply the right unit price."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="space-y-6">
          <Card className="rounded-[1.75rem] border-border shadow-none">
            <CardHeader>
              <CardTitle>Tier list</CardTitle>
              <CardDescription>
                The API rejects overlapping ranges for the same product, variant, and currency.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="filterProduct">Filter by product</Label>
                <Select value={filterProductId} onValueChange={setFilterProductId}>
                  <SelectTrigger id="filterProduct" className="h-11 w-full rounded-xl">
                    <SelectValue placeholder="All products" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="">All products</SelectItem>
                    {(productsQuery.data ?? []).map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {tiersQuery.isLoading ? (
                <p className="text-sm text-muted-foreground">Loading bulk pricing tiers...</p>
              ) : tiersQuery.isError ? (
                <p className="text-sm text-red-700">We could not load bulk pricing right now.</p>
              ) : tiersQuery.data && tiersQuery.data.length > 0 ? (
                tiersQuery.data.map((tier) => (
                  <TierRow
                    key={tier.id}
                    tier={tier}
                    selected={tier.id === selectedTierId}
                    onSelect={(item) => {
                      setSelectedTierId(item.id);
                      setMessage(null);
                      setError(null);
                    }}
                  />
                ))
              ) : (
                <EmptyState
                  title="No tiers yet"
                  description="Create the first bulk tier to unlock volume-based unit pricing."
                />
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="rounded-[1.75rem] border-border shadow-none">
            <CardHeader>
              <CardTitle>{selectedTier ? 'Edit tier' : 'Create tier'}</CardTitle>
              <CardDescription>
                Product, variant, and currency are fixed after creation. Editing only changes the
                quantity range and price.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="productId">Product</Label>
                <Select
                  value={form.productId}
                  disabled={Boolean(selectedTier)}
                  onValueChange={(val) =>
                    setForm((current) => ({
                      ...current,
                      productId: val,
                      variantId: '',
                    }))
                  }
                >
                  <SelectTrigger id="productId" className="h-11 w-full rounded-xl">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    {(productsQuery.data ?? []).map((product) => (
                      <SelectItem key={product.id} value={product.id}>
                        {product.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="variantId">Variant (optional)</Label>
                <Select
                  value={form.variantId}
                  disabled={Boolean(selectedTier) || !form.productId}
                  onValueChange={(val) => setForm((current) => ({ ...current, variantId: val }))}
                >
                  <SelectTrigger id="variantId" className="h-11 w-full rounded-xl">
                    <SelectValue placeholder="Product-level tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {(variantsQuery.data ?? []).map((variant) => (
                      <SelectItem key={variant.id} value={variant.id}>
                        {variant.name} ({variant.sku})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="currency">Currency</Label>
                <Select
                  value={form.currency}
                  disabled={Boolean(selectedTier)}
                  onValueChange={(val) =>
                    setForm((current) => ({
                      ...current,
                      currency: val as CurrencyCode,
                    }))
                  }
                >
                  <SelectTrigger id="currency" className="h-11 w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={CurrencyCode.NGN}>NGN</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="minQuantity">Min quantity</Label>
                  <Input
                    id="minQuantity"
                    type="number"
                    min="1"
                    value={form.minQuantity}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, minQuantity: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxQuantity">Max quantity</Label>
                  <Input
                    id="maxQuantity"
                    type="number"
                    min="1"
                    value={form.maxQuantity}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, maxQuantity: event.target.value }))
                    }
                    placeholder="Leave blank for open-ended"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="pricePerUnit">Price per unit</Label>
                <Input
                  id="pricePerUnit"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.pricePerUnit}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, pricePerUnit: event.target.value }))
                  }
                />
              </div>

              <div className="flex flex-col gap-3">
                <Button
                  className="w-full"
                  disabled={
                    saveMutation.isPending ||
                    !form.productId ||
                    !form.minQuantity ||
                    !form.pricePerUnit
                  }
                  onClick={() => {
                    setMessage(null);
                    setError(null);
                    saveMutation.mutate();
                  }}
                >
                  {saveMutation.isPending
                    ? 'Saving...'
                    : selectedTier
                      ? 'Save tier'
                      : 'Create tier'}
                </Button>
                <Button variant="ghost" className="w-full" onClick={beginCreate}>
                  Clear form
                </Button>
                {selectedTier ? (
                  <Button
                    variant="destructive"
                    className="w-full"
                    disabled={deleteMutation.isPending}
                    onClick={() => {
                      setMessage(null);
                      setError(null);
                      deleteMutation.mutate(selectedTier.id);
                    }}
                  >
                    {deleteMutation.isPending ? 'Deleting...' : 'Delete tier'}
                  </Button>
                ) : null}
              </div>

              {message ? <p className="text-sm text-emerald-700">{message}</p> : null}
              {error ? <p className="text-sm text-red-700">{error}</p> : null}
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminShell>
  );
}
