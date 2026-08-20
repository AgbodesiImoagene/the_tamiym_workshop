'use client';

/* eslint-disable react-hooks/set-state-in-effect -- Selection changes intentionally reset the discount editor. */

import { AdminShell, formatAdminCurrency, formatAdminDate } from '@/components/admin-shell';
import { getAdminCampaigns } from '@/lib/dashboard';
import {
  createAdminDiscount,
  getAdminDiscounts,
  getAdminProductVariants,
  updateAdminDiscount,
  type AdminDiscount,
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
import { CurrencyCode, DiscountScope, DiscountStatus, DiscountType } from '@tamiym/types';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

type DiscountFormState = {
  code: string;
  type: DiscountType;
  scope: DiscountScope;
  status: DiscountStatus;
  valuePercent: string;
  valueAmount: string;
  minOrderAmount: string;
  startAt: string;
  endAt: string;
  maxRedemptions: string;
  campaignId: string;
  productId: string;
  variantId: string;
};

const emptyForm: DiscountFormState = {
  code: '',
  type: DiscountType.PERCENTAGE,
  scope: DiscountScope.ORDER,
  status: DiscountStatus.ACTIVE,
  valuePercent: '',
  valueAmount: '',
  minOrderAmount: '',
  startAt: '',
  endAt: '',
  maxRedemptions: '',
  campaignId: '',
  productId: '',
  variantId: '',
};

function toDateTimeInput(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 16);
}

function fromDateTimeInput(value: string) {
  return value ? new Date(value).toISOString() : undefined;
}

function toFormState(discount: AdminDiscount): DiscountFormState {
  return {
    code: discount.code ?? '',
    type: discount.type,
    scope: discount.scope,
    status: discount.status,
    valuePercent: discount.valuePercent != null ? String(Number(discount.valuePercent)) : '',
    valueAmount: discount.valueAmount != null ? String(Number(discount.valueAmount)) : '',
    minOrderAmount: discount.minOrderAmount != null ? String(Number(discount.minOrderAmount)) : '',
    startAt: toDateTimeInput(discount.startAt),
    endAt: toDateTimeInput(discount.endAt),
    maxRedemptions: discount.maxRedemptions != null ? String(discount.maxRedemptions) : '',
    campaignId: discount.campaigns[0]?.campaignId ?? '',
    productId: discount.products[0]?.productId ?? '',
    variantId: discount.variants[0]?.variantId ?? '',
  };
}

function getSubjectSummary(discount: AdminDiscount) {
  if (discount.scope === DiscountScope.ORDER) {
    return discount.campaigns.length || discount.products.length || discount.variants.length
      ? 'Order-scoped with linked subjects'
      : 'Sitewide order discount';
  }
  if (discount.scope === DiscountScope.CAMPAIGN) {
    return (
      discount.campaigns.map((item) => item.campaign.title).join(', ') || 'No campaigns linked'
    );
  }
  if (discount.scope === DiscountScope.PRODUCT) {
    return discount.products.map((item) => item.product.name).join(', ') || 'No products linked';
  }
  return (
    discount.variants.map((item) => `${item.variant.name} (${item.variant.sku})`).join(', ') ||
    'No variants linked'
  );
}

function getDiscountValueLabel(discount: AdminDiscount) {
  if (discount.type === DiscountType.PERCENTAGE) {
    return `${Number(discount.valuePercent ?? 0)}% off`;
  }
  if (discount.type === DiscountType.FIXED) {
    return `${formatAdminCurrency(Number(discount.valueAmount ?? 0), discount.currency ?? CurrencyCode.NGN)} off`;
  }
  return 'Bulk-linked pricing rule';
}

function DiscountRow({
  discount,
  selected,
  onSelect,
}: {
  discount: AdminDiscount;
  selected: boolean;
  onSelect: (discount: AdminDiscount) => void;
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
            <p className="text-sm font-semibold text-primary">
              {discount.code || `${discount.scope} ${discount.type}`}
            </p>
            <Badge variant={discount.status === DiscountStatus.ACTIVE ? 'accent' : 'neutral'}>
              {discount.status}
            </Badge>
            <Badge variant="brand">{discount.type}</Badge>
          </div>
          <p className="text-sm text-foreground">{getDiscountValueLabel(discount)}</p>
          <p className="text-xs text-muted-foreground">{getSubjectSummary(discount)}</p>
          <p className="text-xs text-muted-foreground">
            Updated {formatAdminDate(discount.updatedAt)}
          </p>
        </div>
        <Button variant="secondary" size="sm" onClick={() => onSelect(discount)}>
          Edit
        </Button>
      </div>
    </div>
  );
}

export default function AdminPricingDiscountsPage() {
  const queryClient = useQueryClient();
  const [selectedDiscountId, setSelectedDiscountId] = useState<string | null>(null);
  const [form, setForm] = useState<DiscountFormState>(emptyForm);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const discountsQuery = useQuery({
    queryKey: ['admin-discounts'],
    queryFn: getAdminDiscounts,
  });
  const campaignsQuery = useQuery({
    queryKey: ['admin-campaigns'],
    queryFn: getAdminCampaigns,
  });
  const productsQuery = useQuery({
    queryKey: ['admin-products-list'],
    queryFn: getAdminProductList,
  });
  const variantsQuery = useQuery({
    queryKey: ['admin-product-variants', form.productId],
    queryFn: () => getAdminProductVariants(form.productId),
    enabled: Boolean(form.productId) && form.scope === DiscountScope.VARIANT,
  });

  const selectedDiscount = useMemo(
    () => discountsQuery.data?.find((discount) => discount.id === selectedDiscountId) ?? null,
    [discountsQuery.data, selectedDiscountId]
  );

  useEffect(() => {
    if (selectedDiscount) {
      setForm(toFormState(selectedDiscount));
      return;
    }
    setForm(emptyForm);
  }, [selectedDiscount]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const campaignIds =
        selectedDiscount?.campaigns.map((item) => item.campaignId) ??
        (form.scope === DiscountScope.CAMPAIGN && form.campaignId ? [form.campaignId] : []);
      const productIds =
        selectedDiscount?.products.map((item) => item.productId) ??
        (form.scope === DiscountScope.PRODUCT && form.productId ? [form.productId] : []);
      const variantIds =
        selectedDiscount?.variants.map((item) => item.variantId) ??
        (form.scope === DiscountScope.VARIANT && form.variantId ? [form.variantId] : []);

      const commonPayload = {
        code: form.code.trim() || undefined,
        status: form.status,
        valuePercent:
          form.type === DiscountType.PERCENTAGE && form.valuePercent
            ? Number(form.valuePercent)
            : undefined,
        valueAmount:
          form.type !== DiscountType.PERCENTAGE && form.valueAmount
            ? Number(form.valueAmount)
            : undefined,
        currency: form.type === DiscountType.FIXED ? CurrencyCode.NGN : undefined,
        minOrderAmount: form.minOrderAmount ? Number(form.minOrderAmount) : undefined,
        startAt: fromDateTimeInput(form.startAt),
        endAt: fromDateTimeInput(form.endAt),
        maxRedemptions: form.maxRedemptions ? Number(form.maxRedemptions) : undefined,
        campaignIds,
        productIds,
        variantIds,
      };

      if (selectedDiscount) {
        return updateAdminDiscount(selectedDiscount.id, commonPayload);
      }

      return createAdminDiscount({
        ...commonPayload,
        type: form.type,
        scope: form.scope,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['admin-discounts'] });
      setMessage(selectedDiscount ? 'Discount updated.' : 'Discount created.');
      setError(null);
      if (!selectedDiscount) {
        setForm(emptyForm);
      }
    },
    onError: (mutationError: { message?: string }) => {
      setError(mutationError.message || 'We could not save the discount.');
      setMessage(null);
    },
  });

  function beginCreate() {
    setSelectedDiscountId(null);
    setForm(emptyForm);
    setMessage(null);
    setError(null);
  }

  const formDisabledForBulk = form.type === DiscountType.BULK;

  return (
    <AdminShell
      activeNav="pricing"
      title="Discounts"
      description="Manage sitewide, campaign, product, and variant discounts with the same active-subject guardrails enforced by the API."
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Card className="rounded-[1.75rem] border-border shadow-none">
          <CardHeader>
            <CardTitle>Discount list</CardTitle>
            <CardDescription>
              Active conflicts are validated by the API, so duplicate live discounts for the same
              subject are rejected on save.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {discountsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading discounts...</p>
            ) : discountsQuery.isError ? (
              <p className="text-sm text-red-700">We could not load discounts right now.</p>
            ) : discountsQuery.data && discountsQuery.data.length > 0 ? (
              discountsQuery.data.map((discount) => (
                <DiscountRow
                  key={discount.id}
                  discount={discount}
                  selected={discount.id === selectedDiscountId}
                  onSelect={(item) => {
                    setSelectedDiscountId(item.id);
                    setMessage(null);
                    setError(null);
                  }}
                />
              ))
            ) : (
              <EmptyState
                title="No discounts yet"
                description="Create the first active pricing rule for sitewide, campaign, product, or variant checkout."
              />
            )}
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="rounded-[1.75rem] border-border shadow-none">
            <CardHeader>
              <CardTitle>{selectedDiscount ? 'Edit discount' : 'Create discount'}</CardTitle>
              <CardDescription>
                Scope and type are fixed once created, so editing focuses on status, values, and
                schedule.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="discountCode">Code</Label>
                <Input
                  id="discountCode"
                  value={form.code}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, code: event.target.value }))
                  }
                  placeholder="e.g. SAVE10"
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="discountType">Type</Label>
                  <Select
                    value={form.type}
                    disabled={Boolean(selectedDiscount)}
                    onValueChange={(val) =>
                      setForm((current) => ({
                        ...current,
                        type: val as DiscountType,
                        valuePercent: '',
                        valueAmount: '',
                      }))
                    }
                  >
                    <SelectTrigger id="discountType" className="h-11 w-full rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DiscountType.PERCENTAGE}>Percentage</SelectItem>
                      <SelectItem value={DiscountType.FIXED}>Fixed amount</SelectItem>
                      <SelectItem value={DiscountType.BULK}>Bulk</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="discountScope">Scope</Label>
                  <Select
                    value={form.scope}
                    disabled={Boolean(selectedDiscount)}
                    onValueChange={(val) =>
                      setForm((current) => ({
                        ...current,
                        scope: val as DiscountScope,
                        campaignId: '',
                        productId: '',
                        variantId: '',
                      }))
                    }
                  >
                    <SelectTrigger id="discountScope" className="h-11 w-full rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={DiscountScope.ORDER}>Order</SelectItem>
                      <SelectItem value={DiscountScope.CAMPAIGN}>Campaign</SelectItem>
                      <SelectItem value={DiscountScope.PRODUCT}>Product</SelectItem>
                      <SelectItem value={DiscountScope.VARIANT}>Variant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="discountStatus">Status</Label>
                <Select
                  value={form.status}
                  onValueChange={(val) =>
                    setForm((current) => ({
                      ...current,
                      status: val as DiscountStatus,
                    }))
                  }
                >
                  <SelectTrigger id="discountStatus" className="h-11 w-full rounded-xl">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DiscountStatus.ACTIVE}>Active</SelectItem>
                    <SelectItem value={DiscountStatus.INACTIVE}>Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {form.type === DiscountType.PERCENTAGE ? (
                <div className="space-y-2">
                  <Label htmlFor="valuePercent">Percent off</Label>
                  <Input
                    id="valuePercent"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={form.valuePercent}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, valuePercent: event.target.value }))
                    }
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <Label htmlFor="valueAmount">Amount off (NGN)</Label>
                  <Input
                    id="valueAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.valueAmount}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, valueAmount: event.target.value }))
                    }
                  />
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="minOrderAmount">Minimum order amount</Label>
                  <Input
                    id="minOrderAmount"
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.minOrderAmount}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, minOrderAmount: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="maxRedemptions">Max redemptions</Label>
                  <Input
                    id="maxRedemptions"
                    type="number"
                    min="0"
                    value={form.maxRedemptions}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, maxRedemptions: event.target.value }))
                    }
                  />
                </div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="startAt">Starts at</Label>
                  <Input
                    id="startAt"
                    type="datetime-local"
                    value={form.startAt}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, startAt: event.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="endAt">Ends at</Label>
                  <Input
                    id="endAt"
                    type="datetime-local"
                    value={form.endAt}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, endAt: event.target.value }))
                    }
                  />
                </div>
              </div>

              {selectedDiscount ? (
                <div className="rounded-2xl border border-border bg-muted/30 p-4">
                  <p className="text-sm font-semibold text-foreground">Linked subject</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {getSubjectSummary(selectedDiscount)}
                  </p>
                </div>
              ) : form.scope === DiscountScope.CAMPAIGN ? (
                <div className="space-y-2">
                  <Label htmlFor="campaignId">Campaign</Label>
                  <Select
                    value={form.campaignId}
                    onValueChange={(val) => setForm((current) => ({ ...current, campaignId: val }))}
                  >
                    <SelectTrigger id="campaignId" className="h-11 w-full rounded-xl">
                      <SelectValue placeholder="Select campaign" />
                    </SelectTrigger>
                    <SelectContent>
                      {(campaignsQuery.data ?? []).map((campaign) => (
                        <SelectItem key={campaign.id} value={campaign.id}>
                          {campaign.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : form.scope === DiscountScope.PRODUCT || form.scope === DiscountScope.VARIANT ? (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="productId">Product</Label>
                    <Select
                      value={form.productId}
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

                  {form.scope === DiscountScope.VARIANT ? (
                    <div className="space-y-2">
                      <Label htmlFor="variantId">Variant</Label>
                      <Select
                        value={form.variantId}
                        onValueChange={(val) =>
                          setForm((current) => ({ ...current, variantId: val }))
                        }
                        disabled={!form.productId}
                      >
                        <SelectTrigger id="variantId" className="h-11 w-full rounded-xl">
                          <SelectValue placeholder="Select variant" />
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
                  ) : null}
                </>
              ) : null}

              {formDisabledForBulk ? (
                <p className="text-sm text-muted-foreground">
                  Bulk quantity tiers are managed on the bulk-pricing page. Use this form only if
                  you need to inspect or change the status of an existing bulk-linked discount.
                </p>
              ) : null}

              <div className="flex flex-col gap-3">
                <Button
                  className="w-full"
                  disabled={
                    saveMutation.isPending ||
                    (form.type === DiscountType.PERCENTAGE && !form.valuePercent) ||
                    (form.type !== DiscountType.PERCENTAGE && !form.valueAmount) ||
                    (!selectedDiscount &&
                      form.scope === DiscountScope.CAMPAIGN &&
                      !form.campaignId) ||
                    (!selectedDiscount &&
                      form.scope === DiscountScope.PRODUCT &&
                      !form.productId) ||
                    (!selectedDiscount &&
                      form.scope === DiscountScope.VARIANT &&
                      (!form.productId || !form.variantId))
                  }
                  onClick={() => {
                    setMessage(null);
                    setError(null);
                    saveMutation.mutate();
                  }}
                >
                  {saveMutation.isPending
                    ? 'Saving...'
                    : selectedDiscount
                      ? 'Save discount'
                      : 'Create discount'}
                </Button>
                <Button variant="ghost" className="w-full" onClick={beginCreate}>
                  Clear form
                </Button>
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
