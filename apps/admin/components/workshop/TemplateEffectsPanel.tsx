'use client';

/* eslint-disable react-hooks/set-state-in-effect -- Effect and option changes intentionally reset dependent editor fields. */

import {
  createAdminTemplateEffect,
  deleteAdminTemplateEffect,
  updateAdminTemplateEffect,
  type ProductImage,
  type ProductOption,
  type ProductView,
  type TemplateEffect,
  type WorkshopTemplateEffectType,
} from '@/lib/products';
import {
  Button,
  Card,
  CardContent,
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
} from '@tamiym/ui';
import { useMutation } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';

const EFFECT_TYPES: WorkshopTemplateEffectType[] = ['TINT', 'SHOW', 'HIDE', 'REPLACE_IMAGE'];

function resolveValueLabel(options: ProductOption[], valueId: string) {
  for (const o of options) {
    const v = o.values.find((x) => x.id === valueId);
    if (v) return `${o.name}: ${v.displayName}`;
  }
  return valueId.slice(0, 8);
}

function resolveLayerLabel(view: ProductView, layerId: string) {
  const l = view.templateLayers.find((x) => x.id === layerId);
  return l?.displayName || l?.key || layerId.slice(0, 8);
}

function EffectRow({
  productId,
  view,
  effect,
  options,
  images,
  onSaved,
}: {
  productId: string;
  view: ProductView;
  effect: TemplateEffect;
  options: ProductOption[];
  images: ProductImage[];
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [effectType, setEffectType] = useState<WorkshopTemplateEffectType>(effect.effectType);
  const [optionId, setOptionId] = useState(effect.optionId ?? '');
  const [valueId, setValueId] = useState(effect.optionValueId);
  const [layerId, setLayerId] = useState(effect.templateLayerId);
  const [tintHex, setTintHex] = useState(effect.tintHex ?? '');
  const [replacementId, setReplacementId] = useState(effect.replacementImageId ?? '');
  const [metaJson, setMetaJson] = useState(effect.meta ? JSON.stringify(effect.meta) : '');

  const valueChoices = useMemo(() => {
    const o = options.find((x) => x.id === optionId);
    return o?.values ?? [];
  }, [options, optionId]);

  useEffect(() => {
    if (open) return;
    setEffectType(effect.effectType);
    setOptionId(effect.optionId ?? '');
    setValueId(effect.optionValueId);
    setLayerId(effect.templateLayerId);
    setTintHex(effect.tintHex ?? '');
    setReplacementId(effect.replacementImageId ?? '');
    setMetaJson(effect.meta ? JSON.stringify(effect.meta) : '');
  }, [effect, open]);

  useEffect(() => {
    if (valueChoices.length && !valueChoices.some((v) => v.id === valueId)) {
      setValueId(valueChoices[0]!.id);
    }
  }, [valueChoices, valueId]);

  const saveMut = useMutation({
    mutationFn: () => {
      let meta: Record<string, unknown> | null | undefined;
      if (metaJson.trim()) {
        try {
          meta = JSON.parse(metaJson) as Record<string, unknown>;
        } catch {
          throw new Error('Meta must be valid JSON.');
        }
      } else {
        meta = null;
      }
      return updateAdminTemplateEffect(productId, view.id, effect.id, {
        optionId: optionId || undefined,
        optionValueId: valueId,
        templateLayerId: layerId,
        effectType,
        tintHex: tintHex.trim() || null,
        replacementImageId:
          effectType === 'REPLACE_IMAGE'
            ? replacementId || undefined
            : replacementId
              ? replacementId
              : null,
        meta,
      });
    },
    onSuccess: () => {
      onSaved();
      setOpen(false);
    },
    onError: (e: Error) => alert(e.message || 'Update failed'),
  });

  const delMut = useMutation({
    mutationFn: () => deleteAdminTemplateEffect(productId, view.id, effect.id),
    onSuccess: () => onSaved(),
  });

  return (
    <div className="rounded-xl border border-border bg-muted/10 p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">
            {resolveValueLabel(options, effect.optionValueId)} →{' '}
            {resolveLayerLabel(view, effect.templateLayerId)}
          </p>
          <p className="text-xs text-muted-foreground">
            {effect.effectType}
            {effect.tintHex ? ` · ${effect.tintHex}` : ''}
            {effect.replacementImageId
              ? ` · replace ${effect.replacementImageId.slice(0, 8)}…`
              : ''}
          </p>
        </div>
        <div className="flex gap-1">
          <Button type="button" size="sm" variant="secondary" onClick={() => setOpen(!open)}>
            {open ? 'Close' : 'Edit'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="text-red-600"
            onClick={() => setConfirmDeleteOpen(true)}
          >
            Delete
          </Button>
        </div>
      </div>
      {open ? (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Option</Label>
              <Select
                value={optionId}
                onValueChange={(val) => {
                  setOptionId(val);
                  setValueId('');
                }}
              >
                <SelectTrigger className="h-9 rounded-lg text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name} ({o.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Option value</Label>
              <Select value={valueId} onValueChange={setValueId}>
                <SelectTrigger className="h-9 rounded-lg text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {valueChoices.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.displayName} ({v.valueCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Template layer</Label>
              <Select value={layerId} onValueChange={setLayerId}>
                <SelectTrigger className="h-9 rounded-lg text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {view.templateLayers.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.displayName || l.key} ({l.layerType})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Effect type</Label>
              <Select
                value={effectType}
                onValueChange={(val) => setEffectType(val as WorkshopTemplateEffectType)}
              >
                <SelectTrigger className="h-9 rounded-lg text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EFFECT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {effectType === 'TINT' ? (
            <div className="space-y-1">
              <Label className="text-xs">Tint hex</Label>
              <Input
                className="h-9 font-mono text-sm"
                placeholder="#RRGGBB"
                value={tintHex}
                onChange={(e) => setTintHex(e.target.value)}
              />
            </div>
          ) : null}
          {effectType === 'REPLACE_IMAGE' ? (
            <div className="space-y-1">
              <Label className="text-xs">Replacement product image</Label>
              <Select value={replacementId} onValueChange={setReplacementId}>
                <SelectTrigger className="h-9 rounded-lg text-sm">
                  <SelectValue placeholder="Select image…" />
                </SelectTrigger>
                <SelectContent>
                  {images.map((im) => (
                    <SelectItem key={im.id} value={im.id}>
                      {im.id.slice(0, 8)}… {im.altText ? `· ${im.altText}` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label className="text-xs">Meta (JSON, optional)</Label>
            <Input
              className="h-9 font-mono text-xs"
              value={metaJson}
              onChange={(e) => setMetaJson(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => saveMut.mutate()}
            disabled={saveMut.isPending}
          >
            {saveMut.isPending ? 'Saving…' : 'Save effect'}
          </Button>
        </div>
      ) : null}
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title="Delete template effect?"
        confirmLabel="Delete"
        destructive
        onConfirm={() => delMut.mutate()}
      />
    </div>
  );
}

export function TemplateEffectsPanel({
  productId,
  view,
  options,
  images,
  onRefresh,
}: {
  productId: string;
  view: ProductView;
  options: ProductOption[];
  images: ProductImage[];
  onRefresh: () => void;
}) {
  const effects = view.templateEffects ?? [];

  const optionsWithValues = useMemo(() => options.filter((o) => o.values.length > 0), [options]);

  const [effectType, setEffectType] = useState<WorkshopTemplateEffectType>('TINT');
  const [optionId, setOptionId] = useState(optionsWithValues[0]?.id ?? '');
  const [valueId, setValueId] = useState(optionsWithValues[0]?.values[0]?.id ?? '');
  const [layerId, setLayerId] = useState(view.templateLayers[0]?.id ?? '');
  const [tintHex, setTintHex] = useState('');
  const [replacementId, setReplacementId] = useState('');
  const [metaJson, setMetaJson] = useState('');

  useEffect(() => {
    const first = optionsWithValues[0];
    if (!first) return;
    if (!optionsWithValues.some((o) => o.id === optionId)) {
      setOptionId(first.id);
      setValueId(first.values[0]?.id ?? '');
    }
  }, [optionsWithValues, optionId]);

  const valueChoices = useMemo(() => {
    const o = optionsWithValues.find((x) => x.id === optionId);
    return o?.values ?? [];
  }, [optionsWithValues, optionId]);

  useEffect(() => {
    if (valueChoices.length && !valueChoices.some((v) => v.id === valueId)) {
      setValueId(valueChoices[0]!.id);
    }
  }, [valueChoices, valueId]);

  const createMut = useMutation({
    mutationFn: () => {
      if (!optionId || !valueId || !layerId) {
        throw new Error('Choose option, value, and layer.');
      }
      let meta: Record<string, unknown> | undefined;
      if (metaJson.trim()) {
        try {
          meta = JSON.parse(metaJson) as Record<string, unknown>;
        } catch {
          throw new Error('Meta must be valid JSON.');
        }
      }
      const dto: Parameters<typeof createAdminTemplateEffect>[2] = {
        optionId,
        optionValueId: valueId,
        templateLayerId: layerId,
        effectType,
        ...(effectType === 'TINT' && tintHex.trim() ? { tintHex: tintHex.trim() } : {}),
        ...(effectType === 'REPLACE_IMAGE' && replacementId
          ? { replacementImageId: replacementId }
          : {}),
        ...(meta ? { meta } : {}),
      };
      if (effectType === 'REPLACE_IMAGE' && !replacementId) {
        throw new Error('REPLACE_IMAGE requires a replacement product image.');
      }
      return createAdminTemplateEffect(productId, view.id, dto);
    },
    onSuccess: () => {
      onRefresh();
      setTintHex('');
      setMetaJson('');
    },
    onError: (e: Error) => alert(e.message || 'Create failed'),
  });

  if (optionsWithValues.length === 0 || view.templateLayers.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Template effects</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Add at least one product option (with at least one value) and one template layer before
            configuring effects.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Template effects</CardTitle>
        <p className="text-sm text-muted-foreground">
          When a buyer picks an option value, these rules adjust template layers (tint, show/hide,
          or swap image).
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {effects.length === 0 ? (
          <p className="text-sm text-muted-foreground">No effects for this view yet.</p>
        ) : (
          <div className="space-y-2">
            {effects.map((ef) => (
              <EffectRow
                key={ef.id}
                productId={productId}
                view={view}
                effect={ef}
                options={optionsWithValues}
                images={images}
                onSaved={onRefresh}
              />
            ))}
          </div>
        )}

        <div className="space-y-3 border-t border-border pt-4">
          <p className="text-sm font-medium">New effect</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <Label className="text-xs">Option</Label>
              <Select
                value={optionId}
                onValueChange={(val) => {
                  setOptionId(val);
                  const o = optionsWithValues.find((x) => x.id === val);
                  setValueId(o?.values[0]?.id ?? '');
                }}
              >
                <SelectTrigger className="h-9 rounded-lg text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {optionsWithValues.map((o) => (
                    <SelectItem key={o.id} value={o.id}>
                      {o.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Option value</Label>
              <Select value={valueId} onValueChange={setValueId}>
                <SelectTrigger className="h-9 rounded-lg text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {valueChoices.map((v) => (
                    <SelectItem key={v.id} value={v.id}>
                      {v.displayName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Template layer</Label>
              <Select value={layerId} onValueChange={setLayerId}>
                <SelectTrigger className="h-9 rounded-lg text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {view.templateLayers.map((l) => (
                    <SelectItem key={l.id} value={l.id}>
                      {l.displayName || l.key}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Effect type</Label>
              <Select
                value={effectType}
                onValueChange={(val) => setEffectType(val as WorkshopTemplateEffectType)}
              >
                <SelectTrigger className="h-9 rounded-lg text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EFFECT_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {effectType === 'TINT' ? (
            <div className="space-y-1">
              <Label className="text-xs">Tint hex</Label>
              <Input
                className="h-9 font-mono text-sm"
                placeholder="#RRGGBB"
                value={tintHex}
                onChange={(e) => setTintHex(e.target.value)}
              />
            </div>
          ) : null}
          {effectType === 'REPLACE_IMAGE' ? (
            <div className="space-y-1">
              <Label className="text-xs">Replacement product image (required)</Label>
              <Select value={replacementId} onValueChange={setReplacementId}>
                <SelectTrigger className="h-9 rounded-lg text-sm">
                  <SelectValue placeholder="Select…" />
                </SelectTrigger>
                <SelectContent>
                  {images.map((im) => (
                    <SelectItem key={im.id} value={im.id}>
                      {im.id.slice(0, 8)}…
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}
          <div className="space-y-1">
            <Label className="text-xs">Meta (JSON)</Label>
            <Input
              className="h-9 font-mono text-xs"
              value={metaJson}
              onChange={(e) => setMetaJson(e.target.value)}
            />
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => createMut.mutate()}
            disabled={createMut.isPending}
          >
            {createMut.isPending ? 'Creating…' : 'Create effect'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
