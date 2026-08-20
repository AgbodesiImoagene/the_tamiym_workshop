'use client';

import { createAdminProductView, type ProductView } from '@/lib/products';
import type { ApiError } from '@/lib/api';
import { STANDARD_PRODUCT_VIEW_PRESETS } from '@/components/workshop/standard-product-views';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Label,
} from '@tamiym/ui';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

type Props = {
  productId: string;
  views: ProductView[];
  onCreated: (viewId: string) => void;
  /** After creating several standard views at once (refresh; parent usually clears active tab). */
  onBulkCreated?: () => void;
  /** `empty`: full explainer for first view; `inline`: compact “add another” card */
  variant?: 'empty' | 'inline';
};

export function CreateProductViewForm({
  productId,
  views,
  onCreated,
  onBulkCreated,
  variant = 'inline',
}: Props) {
  const nextSort = useMemo(
    () => (views.length === 0 ? 0 : Math.max(...views.map((v) => v.sortOrder), 0) + 1),
    [views]
  );

  const [key, setKey] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [sortOrder, setSortOrder] = useState(String(nextSort));
  const [isDesignable, setIsDesignable] = useState(true);
  const [isDefault, setIsDefault] = useState(views.length === 0);

  useEffect(() => {
    setSortOrder(String(nextSort));
  }, [nextSort]);

  useEffect(() => {
    if (views.length > 0) setIsDefault(false);
  }, [views.length]);

  const createMut = useMutation({
    mutationFn: () => {
      const k = key.trim().toLowerCase().replace(/\s+/g, '_');
      const d = displayName.trim();
      if (!k || !d) {
        throw new Error('Key and display name are required.');
      }
      const trimmedSort = sortOrder.trim();
      let sortValue = nextSort;
      if (trimmedSort !== '') {
        const so = parseInt(trimmedSort, 10);
        if (Number.isNaN(so)) {
          throw new Error('Sort order must be a number.');
        }
        sortValue = so;
      }
      return createAdminProductView(productId, {
        key: k,
        displayName: d,
        sortOrder: sortValue,
        isDesignable,
        isDefault,
      });
    },
    onSuccess: (res) => {
      onCreated(res.id);
      setKey('');
      setDisplayName('');
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as ApiError).message)
          : 'Could not create view';
      alert(msg);
    },
  });

  const missingStandard = useMemo(() => {
    const have = new Set(views.map((v) => v.key));
    return STANDARD_PRODUCT_VIEW_PRESETS.filter((p) => !have.has(p.key));
  }, [views]);

  const presetMut = useMutation({
    mutationFn: async () => {
      if (missingStandard.length === 0) {
        throw new Error('All standard views already exist for this product.');
      }
      let sortBase = views.length === 0 ? 0 : Math.max(...views.map((v) => v.sortOrder), 0) + 1;
      const productHadNoViews = views.length === 0;
      let first = true;
      let lastId = '';
      for (const def of missingStandard) {
        const res = await createAdminProductView(productId, {
          key: def.key,
          displayName: def.displayName,
          sortOrder: sortBase,
          isDesignable: true,
          isDefault: productHadNoViews && first,
        });
        first = false;
        sortBase += 1;
        lastId = res.id;
      }
      return { created: missingStandard.length, lastId };
    },
    onSuccess: ({ created, lastId }) => {
      if (created > 1 && onBulkCreated) {
        onBulkCreated();
      } else {
        onCreated(lastId);
      }
    },
    onError: (e: unknown) => {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as ApiError).message)
          : 'Could not add standard views';
      alert(msg);
    },
  });

  const fields = (
    <div className="space-y-4">
      {missingStandard.length > 0 ? (
        <div className="rounded-xl border border-border bg-muted/15 p-3 space-y-2">
          <p className="text-xs font-medium text-foreground">Standard placements</p>
          <p className="text-xs text-muted-foreground">
            Add every common view you do not have yet:{' '}
            {missingStandard.map((p) => p.displayName).join(', ')}.
          </p>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={presetMut.isPending}
            onClick={() => presetMut.mutate()}
          >
            {presetMut.isPending
              ? 'Adding…'
              : `Add ${missingStandard.length} missing standard view${missingStandard.length !== 1 ? 's' : ''}`}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Standard set (front, back, left sleeve, right sleeve) is already present — use the form
          below for custom views.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1">
          <Label className="text-xs">View key</Label>
          <Input
            className="h-9 font-mono text-sm"
            placeholder="front"
            value={key}
            onChange={(e) => setKey(e.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Unique per product (lowercase, e.g. front, back). Spaces become underscores.
          </p>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Display name</Label>
          <Input
            className="h-9"
            placeholder="Front"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Sort order</Label>
        <Input
          className="h-9 w-28"
          inputMode="numeric"
          value={sortOrder}
          onChange={(e) => setSortOrder(e.target.value)}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={isDesignable}
          onCheckedChange={(checked) => setIsDesignable(checked as boolean)}
        />
        <span>Designable (workshop / print area)</span>
      </label>
      <label className="flex cursor-pointer items-center gap-2 text-sm">
        <Checkbox
          checked={isDefault}
          onCheckedChange={(checked) => setIsDefault(checked as boolean)}
        />
        <span>Default view for this product</span>
      </label>
      <Button
        type="button"
        size="sm"
        disabled={createMut.isPending}
        onClick={() => createMut.mutate()}
      >
        {createMut.isPending ? 'Creating…' : 'Create view'}
      </Button>
    </div>
  );

  if (variant === 'empty') {
    return (
      <Card className="rounded-[1.75rem] border-border shadow-xs">
        <CardHeader>
          <CardTitle>Product views</CardTitle>
          <CardDescription>
            Workshop templates, print areas, and template layers belong to a view (for example front
            vs back). Create at least one view to set up the workshop.
          </CardDescription>
        </CardHeader>
        <CardContent>{fields}</CardContent>
      </Card>
    );
  }

  return (
    <Card className="rounded-[1.75rem] border-border shadow-xs">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Add another view</CardTitle>
        <CardDescription>
          Each view has its own template layers, print area, and template effects.
        </CardDescription>
      </CardHeader>
      <CardContent>{fields}</CardContent>
    </Card>
  );
}
