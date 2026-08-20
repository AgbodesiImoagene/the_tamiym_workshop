'use client';

/* eslint-disable react-hooks/set-state-in-effect -- Selected records intentionally reset their local editors. */

import { formatAdminCurrency } from '@/components/admin-shell';
import {
  createAdminOptionValue,
  createAdminProductImageRole,
  createAdminProductImageFromUrl,
  createAdminProductOption,
  deleteAdminOptionValue,
  deleteAdminProductImage,
  deleteAdminProductImageRole,
  deleteAdminProductOption,
  deleteAdminProductPrice,
  deleteAdminProductVariant,
  deleteAdminVariantPrice,
  listAdminProductVariants,
  patchAdminVariantInventory,
  type AdminProductDetail,
  type AdminProductImageRoleRow,
  type AdminProductPrice,
  type AdminProductVariant,
  type CatalogImageRole,
  type OptionValue,
  type ProductOption,
  type ProductView,
  updateAdminOptionValue,
  updateAdminProductImageMeta,
  updateAdminProductImageRole,
  updateAdminProductOption,
  updateAdminProductPrice,
  updateAdminProductVariant,
  updateAdminVariantPrice,
  upsertAdminProductPrice,
  upsertAdminVariantPrice,
  uploadAdminProductImage,
} from '@/lib/products';
import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
} from '@tamiym/ui';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

const CURRENCIES = ['NGN'] as const;

function imageThumbUrl(img: { mediaAsset: AdminProductDetail['images'][0]['mediaAsset'] }) {
  const d = img.mediaAsset?.derivatives ?? [];
  return (
    d.find((x) => x.type === 'THUMB')?.url ??
    d.find((x) => x.type === 'DISPLAY')?.url ??
    d[0]?.url ??
    img.mediaAsset?.originalUrl ??
    null
  );
}

function comboCount(options: ProductOption[]): number {
  if (!options.length) return 0;
  return options.reduce((acc, o) => acc * Math.max(1, o.values.length), 1);
}

// ─── Base prices ───────────────────────────────────────────────────────────────

function BasePricesSection({
  productId,
  prices,
  onChanged,
}: {
  productId: string;
  prices: AdminProductPrice[];
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-product-detail', productId] });
    await queryClient.invalidateQueries({ queryKey: ['admin-product-variants', productId] });
    onChanged();
  }, [queryClient, productId, onChanged]);

  const [currency, setCurrency] = useState<string>('NGN');
  const [amount, setAmount] = useState('');
  const [compareAt, setCompareAt] = useState('');

  const addMut = useMutation({
    mutationFn: () =>
      upsertAdminProductPrice(productId, {
        currency,
        amount: Number(amount),
        compareAt: compareAt ? Number(compareAt) : undefined,
      }),
    onSuccess: () => {
      void refresh();
      setAmount('');
      setCompareAt('');
    },
  });

  return (
    <Card className="rounded-[1.75rem] border-border shadow-xs">
      <CardHeader>
        <CardTitle>Base prices</CardTitle>
        <CardDescription>
          Default prices per currency. Variants without their own price use the product base for
          that currency.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {prices.length === 0 ? (
          <p className="text-sm text-muted-foreground">No base prices yet.</p>
        ) : (
          <div className="space-y-3">
            {prices.map((p) => (
              <BasePriceRow key={p.id} productId={productId} price={p} onSaved={refresh} />
            ))}
          </div>
        )}
        <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
          <div className="space-y-1">
            <Label className="text-xs">Currency</Label>
            <Select value={currency} onValueChange={setCurrency}>
              <SelectTrigger className="h-10 rounded-lg text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((c) => (
                  <SelectItem key={c} value={c}>
                    {c}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Amount</Label>
            <Input
              className="h-10 w-32"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Compare-at (optional)</Label>
            <Input
              className="h-10 w-32"
              inputMode="decimal"
              value={compareAt}
              onChange={(e) => setCompareAt(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={addMut.isPending || amount === '' || Number.isNaN(Number(amount))}
            onClick={() => addMut.mutate()}
          >
            {addMut.isPending ? 'Adding…' : 'Upsert base price'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function BasePriceRow({
  productId,
  price,
  onSaved,
}: {
  productId: string;
  price: AdminProductPrice;
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(Number(price.amount)));
  const [compareAt, setCompareAt] = useState(
    price.compareAt != null ? String(Number(price.compareAt)) : ''
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const saveMut = useMutation({
    mutationFn: () =>
      updateAdminProductPrice(productId, price.id, {
        amount: Number(amount),
        compareAt: compareAt === '' ? null : Number(compareAt),
      }),
    onSuccess: () => onSaved(),
  });

  const delMut = useMutation({
    mutationFn: () => deleteAdminProductPrice(productId, price.id),
    onSuccess: () => onSaved(),
  });

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-muted/20 p-3">
      <span className="text-sm font-medium">{price.currency}</span>
      <div className="space-y-1">
        <Label className="text-xs">Amount</Label>
        <Input
          className="h-9 w-28"
          inputMode="decimal"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Compare-at</Label>
        <Input
          className="h-9 w-28"
          inputMode="decimal"
          value={compareAt}
          onChange={(e) => setCompareAt(e.target.value)}
        />
      </div>
      <Button type="button" size="sm" variant="secondary" onClick={() => saveMut.mutate()}>
        Save
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-red-600"
        onClick={() => setConfirmOpen(true)}
      >
        Remove
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={`Remove ${price.currency} base price?`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => delMut.mutate()}
      />
    </div>
  );
}

// ─── Options & values ──────────────────────────────────────────────────────────

function OptionValueRow({
  productId,
  optionId,
  value,
  onChanged,
}: {
  productId: string;
  optionId: string;
  value: OptionValue;
  onChanged: () => void;
}) {
  const [valueCode, setValueCode] = useState(value.valueCode);
  const [displayName, setDisplayName] = useState(value.displayName);
  const [sortOrder, setSortOrder] = useState(String(value.sortOrder));
  const [metadataJson, setMetadataJson] = useState(
    value.metadata ? JSON.stringify(value.metadata, null, 0) : ''
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const saveMut = useMutation({
    mutationFn: () => {
      const payload: {
        valueCode: string;
        displayName: string;
        sortOrder: number;
        metadata?: Record<string, unknown>;
      } = {
        valueCode: valueCode.trim(),
        displayName: displayName.trim(),
        sortOrder: parseInt(sortOrder, 10),
      };
      if (metadataJson.trim()) {
        try {
          payload.metadata = JSON.parse(metadataJson) as Record<string, unknown>;
        } catch {
          throw new Error('Metadata must be valid JSON.');
        }
      }
      return updateAdminOptionValue(productId, optionId, value.id, payload);
    },
    onSuccess: () => onChanged(),
    onError: (e: Error) => alert(e.message),
  });

  const delMut = useMutation({
    mutationFn: () => deleteAdminOptionValue(productId, optionId, value.id),
    onSuccess: () => onChanged(),
  });

  return (
    <TableRow className="border-b border-border/80">
      <TableCell className="py-2 pr-2">
        <Input className="h-9" value={valueCode} onChange={(e) => setValueCode(e.target.value)} />
      </TableCell>
      <TableCell className="py-2 pr-2">
        <Input
          className="h-9"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </TableCell>
      <TableCell className="py-2 pr-2">
        <Input
          className="h-9 w-20"
          inputMode="numeric"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </TableCell>
      <TableCell className="py-2 pr-2">
        <Input
          className="h-9 font-mono text-xs"
          placeholder='{"hex":"#000"}'
          value={metadataJson}
          onChange={(e) => setMetadataJson(e.target.value)}
        />
      </TableCell>
      <TableCell className="py-2">
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="secondary" onClick={() => saveMut.mutate()}>
            Save
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-red-600"
            onClick={() => setConfirmOpen(true)}
          >
            Delete
          </Button>
        </div>
      </TableCell>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete option value?"
        description="Variants will regenerate after deletion."
        confirmLabel="Delete"
        destructive
        onConfirm={() => delMut.mutate()}
      />
    </TableRow>
  );
}

function OptionCard({
  productId,
  option,
  comboTotal,
  onChanged,
}: {
  productId: string;
  option: ProductOption;
  comboTotal: number;
  onChanged: () => void;
}) {
  const [code, setCode] = useState(option.code);
  const [name, setName] = useState(option.name);
  const [sortOrder, setSortOrder] = useState(String(option.sortOrder));
  const [newCode, setNewCode] = useState('');
  const [newName, setNewName] = useState('');
  const [newSort, setNewSort] = useState('0');
  const [confirmDeleteOption, setConfirmDeleteOption] = useState(false);

  const saveOpt = useMutation({
    mutationFn: () =>
      updateAdminProductOption(productId, option.id, {
        code: code.trim(),
        name: name.trim(),
        sortOrder: parseInt(sortOrder, 10),
      }),
    onSuccess: () => onChanged(),
  });

  const delOpt = useMutation({
    mutationFn: () => deleteAdminProductOption(productId, option.id),
    onSuccess: () => onChanged(),
  });

  const addVal = useMutation({
    mutationFn: () =>
      createAdminOptionValue(productId, option.id, {
        valueCode: newCode.trim(),
        displayName: newName.trim(),
        sortOrder: parseInt(newSort, 10),
      }),
    onSuccess: () => {
      onChanged();
      setNewCode('');
      setNewName('');
      setNewSort('0');
    },
    onError: (e: Error & { message?: string }) => alert(e.message || 'Could not add value'),
  });

  return (
    <div className="rounded-2xl border border-border bg-white p-4 shadow-xs">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">Code</Label>
          <Input className="h-9 w-36" value={code} onChange={(e) => setCode(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Name</Label>
          <Input className="h-9 w-44" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Sort</Label>
          <Input
            className="h-9 w-20"
            inputMode="numeric"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
          />
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => saveOpt.mutate()}>
          Save option
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-red-600"
          onClick={() => setConfirmDeleteOption(true)}
        >
          Delete option
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Cartesian variant combinations for this product: <strong>{comboTotal}</strong> (max 1000).
      </p>
      <div className="mt-4">
        <Table className="min-w-[640px]">
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="pb-2 text-xs text-muted-foreground font-normal">
                Value code
              </TableHead>
              <TableHead className="pb-2 text-xs text-muted-foreground font-normal">
                Display
              </TableHead>
              <TableHead className="pb-2 text-xs text-muted-foreground font-normal">Sort</TableHead>
              <TableHead className="pb-2 text-xs text-muted-foreground font-normal">
                Metadata (JSON)
              </TableHead>
              <TableHead className="pb-2" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {option.values.map((v) => (
              <OptionValueRow
                key={v.id}
                productId={productId}
                optionId={option.id}
                value={v}
                onChanged={onChanged}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      <div className="mt-4 flex flex-wrap items-end gap-2 border-t border-border pt-4">
        <Input
          className="h-9 w-32"
          placeholder="code"
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
        />
        <Input
          className="h-9 w-40"
          placeholder="Display name"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
        />
        <Input
          className="h-9 w-16"
          inputMode="numeric"
          placeholder="sort"
          value={newSort}
          onChange={(e) => setNewSort(e.target.value)}
        />
        <Button
          type="button"
          size="sm"
          disabled={addVal.isPending || !newCode.trim() || !newName.trim()}
          onClick={() => addVal.mutate()}
        >
          Add value
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDeleteOption}
        onOpenChange={setConfirmDeleteOption}
        title="Delete this option?"
        description="This will delete the entire option and all its values."
        confirmLabel="Delete"
        destructive
        onConfirm={() => delOpt.mutate()}
      />
    </div>
  );
}

function OptionsSection({
  productId,
  options,
  onChanged,
}: {
  productId: string;
  options: ProductOption[];
  onChanged: () => void;
}) {
  const [optCode, setOptCode] = useState('');
  const [optName, setOptName] = useState('');
  const [optSort, setOptSort] = useState('0');

  const comboTotal = useMemo(() => comboCount(options), [options]);

  const addOpt = useMutation({
    mutationFn: () =>
      createAdminProductOption(productId, {
        code: optCode.trim(),
        name: optName.trim(),
        sortOrder: parseInt(optSort, 10),
      }),
    onSuccess: () => {
      onChanged();
      setOptCode('');
      setOptName('');
      setOptSort('0');
    },
    onError: (e: Error & { message?: string }) => alert(e.message || 'Could not create option'),
  });

  return (
    <Card className="rounded-[1.75rem] border-border shadow-xs">
      <CardHeader>
        <CardTitle>Options & values</CardTitle>
        <CardDescription>
          Define option axes (for example Size, Color). Saving changes regenerates SKUs and variant
          rows automatically.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {options.map((o) => (
          <OptionCard
            key={o.id}
            productId={productId}
            option={o}
            comboTotal={comboTotal}
            onChanged={onChanged}
          />
        ))}
        <div className="flex flex-wrap items-end gap-2 rounded-xl border border-dashed border-border p-4">
          <span className="text-sm font-medium text-muted-foreground">New option</span>
          <Input
            className="h-9 w-32"
            placeholder="code"
            value={optCode}
            onChange={(e) => setOptCode(e.target.value)}
          />
          <Input
            className="h-9 w-40"
            placeholder="Name"
            value={optName}
            onChange={(e) => setOptName(e.target.value)}
          />
          <Input
            className="h-9 w-16"
            inputMode="numeric"
            value={optSort}
            onChange={(e) => setOptSort(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            disabled={addOpt.isPending || !optCode.trim() || !optName.trim()}
            onClick={() => addOpt.mutate()}
          >
            Add option
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Images & roles ──────────────────────────────────────────────────────────

function CatalogMediaSection({
  product,
  onChanged,
}: {
  product: AdminProductDetail;
  onChanged: () => void;
}) {
  const productId = product.id;
  const queryClient = useQueryClient();
  const variantsQuery = useQuery({
    queryKey: ['admin-product-variants', productId],
    queryFn: () => listAdminProductVariants(productId),
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-product-detail', productId] });
    await queryClient.invalidateQueries({ queryKey: ['admin-product-variants', productId] });
    onChanged();
  }, [queryClient, productId, onChanged]);

  const roles = product.productImageRoles ?? [];
  const images = product.images ?? [];

  const [urlImport, setUrlImport] = useState('');
  const [roleImageId, setRoleImageId] = useState('');
  const [roleKind, setRoleKind] = useState<CatalogImageRole>('GALLERY');
  const [roleSort, setRoleSort] = useState('0');
  const [roleViewId, setRoleViewId] = useState(product.views[0]?.id ?? '');

  const importMut = useMutation({
    mutationFn: () => createAdminProductImageFromUrl(productId, { sourceUrl: urlImport.trim() }),
    onSuccess: () => {
      void refresh();
      setUrlImport('');
    },
    onError: (e: Error & { message?: string }) => alert(e.message || 'Import failed'),
  });

  const roleMut = useMutation({
    mutationFn: () => {
      if (roleKind === 'WORKSHOP_TEMPLATE' && !roleViewId) {
        throw new Error('Select a product view for workshop template roles.');
      }
      return createAdminProductImageRole(productId, roleImageId, {
        role: roleKind,
        sortOrder: parseInt(roleSort, 10),
        ...(roleKind === 'WORKSHOP_TEMPLATE' ? { productViewId: roleViewId } : {}),
      });
    },
    onSuccess: () => {
      void refresh();
      setRoleSort('0');
    },
    onError: (e: Error & { message?: string }) => alert(e.message || 'Could not assign role'),
  });

  return (
    <Card className="rounded-[1.75rem] border-border shadow-xs">
      <CardHeader>
        <CardTitle>Catalog media</CardTitle>
        <CardDescription>
          Product images, variant-specific shots, and image roles: thumbnail, gallery, or workshop
          template (per product view). Template layers are still edited in the workshop section
          below.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1 space-y-1">
            <Label className="text-xs">Import image URL</Label>
            <Input
              className="h-9"
              placeholder="https://…"
              value={urlImport}
              onChange={(e) => setUrlImport(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            disabled={importMut.isPending || !urlImport.trim()}
            onClick={() => importMut.mutate()}
          >
            Queue import
          </Button>
        </div>

        <div className="space-y-3">
          <p className="text-sm font-medium">Images</p>
          {images.length === 0 ? (
            <p className="text-sm text-muted-foreground">No images yet.</p>
          ) : (
            images.map((img) => (
              <ImageRow
                key={img.id}
                productId={productId}
                image={img}
                variants={variantsQuery.data ?? []}
                onSaved={refresh}
              />
            ))
          )}
        </div>

        <div className="space-y-2">
          <Label className="text-sm">Upload file</Label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = '';
              if (!f) return;
              try {
                await uploadAdminProductImage(productId, f);
                await refresh();
              } catch (err: unknown) {
                const m =
                  err && typeof err === 'object' && 'message' in err
                    ? String((err as { message: string }).message)
                    : 'Upload failed';
                alert(m);
              }
            }}
          />
        </div>

        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm font-medium">Assign catalog role</p>
          <div className="flex flex-wrap items-end gap-2">
            <Select value={roleImageId} onValueChange={setRoleImageId}>
              <SelectTrigger className="h-10 rounded-lg text-sm">
                <SelectValue placeholder="Select image…" />
              </SelectTrigger>
              <SelectContent>
                {images.map((i) => (
                  <SelectItem key={i.id} value={i.id}>
                    {i.id.slice(0, 8)}… ({i.altText || 'no alt'})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={roleKind} onValueChange={(val) => setRoleKind(val as CatalogImageRole)}>
              <SelectTrigger className="h-10 rounded-lg text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="THUMBNAIL">Thumbnail</SelectItem>
                <SelectItem value="GALLERY">Gallery</SelectItem>
                <SelectItem value="WORKSHOP_TEMPLATE">Workshop template</SelectItem>
              </SelectContent>
            </Select>
            {roleKind === 'WORKSHOP_TEMPLATE' ? (
              <Select value={roleViewId} onValueChange={setRoleViewId}>
                <SelectTrigger className="h-10 min-w-[10rem] rounded-lg text-sm">
                  <SelectValue placeholder="No views — create a view first" />
                </SelectTrigger>
                <SelectContent>
                  {product.views.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.displayName} ({v.key})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Input
              className="h-10 w-20"
              inputMode="numeric"
              value={roleSort}
              onChange={(e) => setRoleSort(e.target.value)}
            />
            <Button
              type="button"
              size="sm"
              disabled={
                roleMut.isPending ||
                !roleImageId ||
                (roleKind === 'WORKSHOP_TEMPLATE' && (!roleViewId || product.views.length === 0))
              }
              onClick={() => roleMut.mutate()}
            >
              Assign role
            </Button>
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Active roles</p>
          {roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No roles assigned.</p>
          ) : (
            roles.map((r) => (
              <RoleRow
                key={r.id}
                productId={productId}
                row={r}
                views={product.views}
                onSaved={refresh}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function RoleRow({
  productId,
  row,
  views,
  onSaved,
}: {
  productId: string;
  row: AdminProductImageRoleRow;
  views: ProductView[];
  onSaved: () => void;
}) {
  const [role, setRole] = useState<CatalogImageRole>(row.role);
  const [viewId, setViewId] = useState(row.productViewId ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sort, setSort] = useState(row.sortOrder != null ? String(row.sortOrder) : '');

  useEffect(() => {
    setRole(row.role);
    setViewId(row.productViewId ?? '');
    setSort(row.sortOrder != null ? String(row.sortOrder) : '');
  }, [row]);

  const viewLabel =
    row.productViewId && views.length
      ? (views.find((v) => v.id === row.productViewId)?.displayName ??
        row.productViewId.slice(0, 8))
      : null;

  const save = useMutation({
    mutationFn: () => {
      if (role === 'WORKSHOP_TEMPLATE' && !viewId) {
        throw new Error('Workshop template roles need a product view.');
      }
      return updateAdminProductImageRole(productId, row.id, {
        role,
        sortOrder: sort.trim() === '' ? null : parseInt(sort, 10),
        productViewId: role === 'WORKSHOP_TEMPLATE' ? viewId : null,
      });
    },
    onSuccess: () => onSaved(),
    onError: (e: Error) => alert(e.message || 'Update failed'),
  });

  const del = useMutation({
    mutationFn: () => deleteAdminProductImageRole(productId, row.id),
    onSuccess: () => onSaved(),
  });

  return (
    <div className="space-y-2 rounded-lg border border-border px-3 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span>
          {row.role} · image {row.image.id.slice(0, 8)}… · sort {row.sortOrder ?? '—'}
          {viewLabel ? ` · view ${viewLabel}` : ''}
        </span>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-red-600"
          onClick={() => setConfirmOpen(true)}
        >
          Remove
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove image role?"
        description="The image itself will remain but the catalog role assignment will be deleted."
        confirmLabel="Remove"
        destructive
        onConfirm={() => del.mutate()}
      />
      <div className="flex flex-wrap items-end gap-2 border-t border-border pt-2">
        <Select value={role} onValueChange={(val) => setRole(val as CatalogImageRole)}>
          <SelectTrigger className="h-9 rounded-lg text-sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="THUMBNAIL">Thumbnail</SelectItem>
            <SelectItem value="GALLERY">Gallery</SelectItem>
            <SelectItem value="WORKSHOP_TEMPLATE">Workshop template</SelectItem>
          </SelectContent>
        </Select>
        {role === 'WORKSHOP_TEMPLATE' ? (
          views.length === 0 ? (
            <span className="text-xs text-amber-700">
              Add a product view on this product before assigning a workshop template role.
            </span>
          ) : (
            <Select value={viewId} onValueChange={setViewId}>
              <SelectTrigger className="h-9 min-w-[9rem] rounded-lg text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {views.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.displayName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )
        ) : null}
        <Input
          className="h-9 w-20"
          inputMode="numeric"
          placeholder="sort"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        />
        <Button type="button" size="sm" variant="secondary" onClick={() => save.mutate()}>
          Save changes
        </Button>
      </div>
    </div>
  );
}

function ImageRow({
  productId,
  image,
  variants,
  onSaved,
}: {
  productId: string;
  image: AdminProductDetail['images'][0];
  variants: AdminProductVariant[];
  onSaved: () => void;
}) {
  const [sortOrder, setSortOrder] = useState(String(image.sortOrder));
  const [altText, setAltText] = useState(image.altText ?? '');
  const [variantId, setVariantId] = useState(image.variantId ?? '');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      updateAdminProductImageMeta(productId, image.id, {
        sortOrder: parseInt(sortOrder, 10),
        altText: altText.trim() || undefined,
        variantId: variantId || null,
      }),
    onSuccess: () => onSaved(),
  });

  const del = useMutation({
    mutationFn: () => deleteAdminProductImage(productId, image.id),
    onSuccess: () => onSaved(),
  });

  const thumb = imageThumbUrl(image);

  return (
    <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border p-3">
      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
        {thumb ? (
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            …
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap gap-2">
        <Input
          className="h-9 w-20"
          inputMode="numeric"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
        <Input
          className="h-9 min-w-[140px] flex-1"
          placeholder="Alt text"
          value={altText}
          onChange={(e) => setAltText(e.target.value)}
        />
        <Select value={variantId} onValueChange={setVariantId}>
          <SelectTrigger className="h-9 rounded-lg text-sm">
            <SelectValue placeholder="All variants" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="">All variants</SelectItem>
            {variants.map((v) => (
              <SelectItem key={v.id} value={v.id}>
                {v.sku}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button type="button" size="sm" variant="secondary" onClick={() => save.mutate()}>
          Save
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-red-600"
          onClick={() => setConfirmOpen(true)}
        >
          Delete
        </Button>
      </div>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete this image?"
        confirmLabel="Delete"
        destructive
        onConfirm={() => del.mutate()}
      />
    </div>
  );
}

// ─── Variants (catalog + prices + inventory) ─────────────────────────────────

function VariantDeepCard({
  productId,
  variant,
  onChanged,
}: {
  productId: string;
  variant: AdminProductVariant;
  onChanged: () => void;
}) {
  const [name, setName] = useState(variant.name);
  const [sku, setSku] = useState(variant.sku);
  const [weight, setWeight] = useState(
    variant.weightGrams != null ? String(variant.weightGrams) : ''
  );
  const [len, setLen] = useState(
    variant.packageLengthMm != null ? String(variant.packageLengthMm) : ''
  );
  const [wid, setWid] = useState(
    variant.packageWidthMm != null ? String(variant.packageWidthMm) : ''
  );
  const [hei, setHei] = useState(
    variant.packageHeightMm != null ? String(variant.packageHeightMm) : ''
  );
  const [avail, setAvail] = useState(variant.isAvailable);
  const [confirmDeleteVariant, setConfirmDeleteVariant] = useState(false);

  const [stockOnHand, setStockOnHand] = useState(String(variant.inventory?.stockOnHand ?? 0));
  const [reserved, setReserved] = useState(String(variant.inventory?.reserved ?? 0));
  const [lowTh, setLowTh] = useState(String(variant.inventory?.lowStockThreshold ?? 0));
  const [trackInv, setTrackInv] = useState(variant.inventory?.trackInventory ?? true);

  const [pcurrency, setPcurrency] = useState('NGN');
  const [pamount, setPamount] = useState('');
  const [pcompare, setPcompare] = useState('');

  useEffect(() => {
    setName(variant.name);
    setSku(variant.sku);
    setWeight(variant.weightGrams != null ? String(variant.weightGrams) : '');
    setLen(variant.packageLengthMm != null ? String(variant.packageLengthMm) : '');
    setWid(variant.packageWidthMm != null ? String(variant.packageWidthMm) : '');
    setHei(variant.packageHeightMm != null ? String(variant.packageHeightMm) : '');
    setAvail(variant.isAvailable);
    setStockOnHand(String(variant.inventory?.stockOnHand ?? 0));
    setReserved(String(variant.inventory?.reserved ?? 0));
    setLowTh(String(variant.inventory?.lowStockThreshold ?? 0));
    setTrackInv(variant.inventory?.trackInventory ?? true);
  }, [variant]);

  const saveCatalog = useMutation({
    mutationFn: () => {
      const dto: {
        name: string;
        sku: string;
        isAvailable: boolean;
        weightGrams?: number;
        packageLengthMm?: number;
        packageWidthMm?: number;
        packageHeightMm?: number;
      } = {
        name: name.trim(),
        sku: sku.trim(),
        isAvailable: avail,
      };
      if (weight.trim() !== '') dto.weightGrams = parseInt(weight, 10);
      if (len.trim() !== '') dto.packageLengthMm = parseInt(len, 10);
      if (wid.trim() !== '') dto.packageWidthMm = parseInt(wid, 10);
      if (hei.trim() !== '') dto.packageHeightMm = parseInt(hei, 10);
      return updateAdminProductVariant(productId, variant.id, dto);
    },
    onSuccess: () => onChanged(),
    onError: (e: Error & { message?: string }) => alert(e.message || 'Save failed'),
  });

  const saveInv = useMutation({
    mutationFn: () =>
      patchAdminVariantInventory(variant.id, {
        stockOnHand: parseInt(stockOnHand, 10),
        reserved: parseInt(reserved, 10),
        lowStockThreshold: parseInt(lowTh, 10),
        trackInventory: trackInv,
        isAvailable: avail,
      }),
    onSuccess: () => onChanged(),
    onError: (e: Error & { message?: string }) => alert(e.message || 'Inventory update failed'),
  });

  const delVar = useMutation({
    mutationFn: () => deleteAdminProductVariant(productId, variant.id),
    onSuccess: () => onChanged(),
    onError: (e: Error & { message?: string }) => alert(e.message || 'Could not delete variant'),
  });

  const addPrice = useMutation({
    mutationFn: () =>
      upsertAdminVariantPrice(productId, variant.id, {
        currency: pcurrency,
        amount: Number(pamount),
        compareAt: pcompare ? Number(pcompare) : undefined,
      }),
    onSuccess: () => {
      onChanged();
      setPamount('');
      setPcompare('');
    },
  });

  const optionLabel = variant.optionValues
    .map((ov) => `${ov.option.name}: ${ov.optionValue.displayName}`)
    .join(' · ');

  return (
    <div className="rounded-2xl border border-border bg-muted/15 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold">{variant.name}</p>
          <p className="text-xs text-muted-foreground">
            {optionLabel || 'Variant'} · ID {variant.id.slice(0, 10)}…
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-red-600"
          onClick={() => setConfirmDeleteVariant(true)}
        >
          Delete variant
        </Button>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
        <div className="space-y-1">
          <Label className="text-xs">Display name</Label>
          <Input className="h-9" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">SKU</Label>
          <Input
            className="h-9 font-mono text-sm"
            value={sku}
            onChange={(e) => setSku(e.target.value)}
          />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={avail} onCheckedChange={(checked) => setAvail(checked as boolean)} />
          Available for sale
        </label>
        <div className="space-y-1">
          <Label className="text-xs">Weight (g)</Label>
          <Input
            className="h-9"
            inputMode="numeric"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Package L×W×H (mm)</Label>
          <div className="flex gap-1">
            <Input
              className="h-9"
              inputMode="numeric"
              value={len}
              onChange={(e) => setLen(e.target.value)}
            />
            <Input
              className="h-9"
              inputMode="numeric"
              value={wid}
              onChange={(e) => setWid(e.target.value)}
            />
            <Input
              className="h-9"
              inputMode="numeric"
              value={hei}
              onChange={(e) => setHei(e.target.value)}
            />
          </div>
        </div>
        <div className="flex items-end">
          <Button type="button" size="sm" onClick={() => saveCatalog.mutate()}>
            Save catalog fields
          </Button>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-4">
        <p className="mb-2 text-sm font-medium">Variant prices</p>
        <div className="space-y-2">
          {variant.prices.map((p) => (
            <VariantPriceRow
              key={p.id}
              productId={productId}
              variantId={variant.id}
              price={p}
              onSaved={onChanged}
            />
          ))}
        </div>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <Select value={pcurrency} onValueChange={setPcurrency}>
            <SelectTrigger className="h-9 rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CURRENCIES.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            className="h-9 w-28"
            placeholder="amount"
            inputMode="decimal"
            value={pamount}
            onChange={(e) => setPamount(e.target.value)}
          />
          <Input
            className="h-9 w-28"
            placeholder="compare"
            inputMode="decimal"
            value={pcompare}
            onChange={(e) => setPcompare(e.target.value)}
          />
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={addPrice.isPending || pamount === ''}
            onClick={() => addPrice.mutate()}
          >
            Upsert price
          </Button>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-4">
        <p className="mb-2 text-sm font-medium">Inventory</p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1">
            <Label className="text-xs">Stock on hand</Label>
            <Input
              inputMode="numeric"
              value={stockOnHand}
              onChange={(e) => setStockOnHand(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Reserved</Label>
            <Input
              inputMode="numeric"
              value={reserved}
              onChange={(e) => setReserved(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Low-stock threshold</Label>
            <Input inputMode="numeric" value={lowTh} onChange={(e) => setLowTh(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={trackInv}
              onCheckedChange={(checked) => setTrackInv(checked as boolean)}
            />
            Track inventory
          </label>
        </div>
        <Button
          type="button"
          size="sm"
          className="mt-3"
          variant="secondary"
          onClick={() => saveInv.mutate()}
        >
          Save inventory
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDeleteVariant}
        onOpenChange={setConfirmDeleteVariant}
        title="Delete variant?"
        description="Only safe when the variant has no order lines or dependent records."
        confirmLabel="Delete"
        destructive
        onConfirm={() => delVar.mutate()}
      />
    </div>
  );
}

function VariantPriceRow({
  productId,
  variantId,
  price,
  onSaved,
}: {
  productId: string;
  variantId: string;
  price: AdminProductVariant['prices'][0];
  onSaved: () => void;
}) {
  const [amount, setAmount] = useState(String(Number(price.amount)));
  const [compareAt, setCompareAt] = useState(
    price.compareAt != null ? String(Number(price.compareAt)) : ''
  );
  const [confirmOpen, setConfirmOpen] = useState(false);

  const save = useMutation({
    mutationFn: () =>
      updateAdminVariantPrice(productId, variantId, price.id, {
        amount: Number(amount),
        compareAt: compareAt === '' ? null : Number(compareAt),
      }),
    onSuccess: () => onSaved(),
  });

  const del = useMutation({
    mutationFn: () => deleteAdminVariantPrice(productId, variantId, price.id),
    onSuccess: () => onSaved(),
  });

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border bg-white px-3 py-2">
      <span className="text-sm font-medium">{price.currency}</span>
      <Input
        className="h-9 w-28"
        inputMode="decimal"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <Input
        className="h-9 w-28"
        inputMode="decimal"
        placeholder="compare"
        value={compareAt}
        onChange={(e) => setCompareAt(e.target.value)}
      />
      <span className="text-xs text-muted-foreground">
        {formatAdminCurrency(Number(price.amount), price.currency)}
      </span>
      <Button type="button" size="sm" variant="secondary" onClick={() => save.mutate()}>
        Save
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-red-600"
        onClick={() => setConfirmOpen(true)}
      >
        Remove
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Remove variant price?"
        confirmLabel="Remove"
        destructive
        onConfirm={() => del.mutate()}
      />
    </div>
  );
}

function VariantsDeepSection({
  productId,
  onChanged,
}: {
  productId: string;
  onChanged: () => void;
}) {
  const queryClient = useQueryClient();
  const q = useQuery({
    queryKey: ['admin-product-variants', productId],
    queryFn: () => listAdminProductVariants(productId),
  });

  const refresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['admin-product-detail', productId] });
    await queryClient.invalidateQueries({ queryKey: ['admin-product-variants', productId] });
    onChanged();
  }, [queryClient, productId, onChanged]);

  return (
    <Card className="rounded-[1.75rem] border-border shadow-xs">
      <CardHeader>
        <CardTitle>Variants, prices & stock</CardTitle>
        <CardDescription>
          Generated from option combinations. Edit SKU, fulfillment attributes, override prices, and
          stock.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {q.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading variants…</p>
        ) : q.isError ? (
          <p className="text-sm text-red-600">Could not load variants.</p>
        ) : !q.data?.length ? (
          <p className="text-sm text-muted-foreground">
            No variants yet. Add options and values above to generate SKUs.
          </p>
        ) : (
          q.data.map((v) => (
            <VariantDeepCard key={v.id} productId={productId} variant={v} onChanged={refresh} />
          ))
        )}
      </CardContent>
    </Card>
  );
}

// ─── Exported panels ─────────────────────────────────────────────────────────

export function ProductMerchandisingPanels({
  product,
  onChanged,
}: {
  product: AdminProductDetail;
  onChanged: () => void;
}) {
  const prices = product.prices ?? [];
  const options = product.options ?? [];

  return (
    <div className="space-y-8">
      <BasePricesSection productId={product.id} prices={prices} onChanged={onChanged} />
      <OptionsSection productId={product.id} options={options} onChanged={onChanged} />
      <CatalogMediaSection product={product} onChanged={onChanged} />
      <VariantsDeepSection productId={product.id} onChanged={onChanged} />
    </div>
  );
}
