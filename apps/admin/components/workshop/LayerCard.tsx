'use client';

import { useRef, useState } from 'react';
import type { TemplateLayer, TemplateLayerType, BlendMode } from '@/lib/products';
import { LAYER_TYPE_LABELS, LAYER_TYPE_COLORS, BLEND_MODE_CSS } from '@/lib/products';
import {
  Button,
  ConfirmDialog,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@tamiym/ui';

const LAYER_TYPES: TemplateLayerType[] = [
  'BASE',
  'SHADOW',
  'HIGHLIGHT',
  'MASK',
  'OVERLAY',
  'PRINT_SIMULATION',
  'OTHER',
];

const BLEND_MODES: BlendMode[] = [
  'NORMAL',
  'MULTIPLY',
  'SCREEN',
  'OVERLAY',
  'DARKEN',
  'LIGHTEN',
  'COLOR_DODGE',
  'COLOR_BURN',
  'HARD_LIGHT',
  'SOFT_LIGHT',
  'DIFFERENCE',
  'EXCLUSION',
];

// ─── Existing Layer Card ──────────────────────────────────────────────────────

interface LayerCardProps {
  layer: TemplateLayer;
  productId: string;
  viewId: string;
  onUpdate: (
    layerId: string,
    dto: { blendMode?: BlendMode; opacity?: number; zIndex?: number; displayName?: string }
  ) => Promise<void>;
  onDelete: (layerId: string) => Promise<void>;
}

export function LayerCard({ layer, productId, viewId, onUpdate, onDelete }: LayerCardProps) {
  const [blendMode, setBlendMode] = useState<BlendMode>(layer.blendMode);
  const [opacity, setOpacity] = useState(layer.opacity);
  const [displayName, setDisplayName] = useState(layer.displayName ?? '');
  const [zIndex, setZIndex] = useState(layer.zIndex);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);

  const isDirty =
    blendMode !== layer.blendMode ||
    opacity !== layer.opacity ||
    displayName !== (layer.displayName ?? '') ||
    zIndex !== layer.zIndex;

  const imageUrl =
    layer.imageUrl ??
    layer.image?.mediaAsset?.derivatives?.[0]?.url ??
    layer.image?.mediaAsset?.originalUrl;

  const handleSave = async () => {
    setSaving(true);
    try {
      await onUpdate(layer.id, {
        blendMode,
        opacity,
        zIndex,
        displayName: displayName || undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setConfirmDeleteOpen(true);
  };

  const blendCss = BLEND_MODE_CSS[blendMode] ?? 'normal';
  const typeColorClass = LAYER_TYPE_COLORS[layer.layerType];

  return (
    <div className="rounded-xl border border-border bg-white p-4 shadow-xs">
      <div className="flex items-start gap-4">
        {/* Preview thumbnail with blend mode applied */}
        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-gray-200">
          {imageUrl && (
            <img
              src={imageUrl}
              alt={layer.displayName ?? layer.key}
              className="absolute inset-0 h-full w-full object-cover"
              style={{
                opacity,
                mixBlendMode: blendCss as React.CSSProperties['mixBlendMode'],
              }}
            />
          )}
          {!imageUrl && (
            <div className="flex h-full w-full items-center justify-center text-xs text-gray-400">
              No img
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="flex-1 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${typeColorClass}`}>
              {LAYER_TYPE_LABELS[layer.layerType]}
            </span>
            <span className="text-xs text-muted-foreground">
              key: <code className="font-mono">{layer.key}</code>
            </span>
            <span className="ml-auto text-xs text-muted-foreground">z-index:</span>
            <input
              type="number"
              value={zIndex}
              onChange={(e) => setZIndex(Number(e.target.value))}
              className="w-14 rounded border border-border px-1.5 py-0.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/50"
            />
          </div>

          {/* Display name */}
          <input
            type="text"
            placeholder={`Display name (default: ${layer.key})`}
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full rounded-lg border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />

          {/* Blend mode + opacity row */}
          <div className="flex flex-wrap gap-3">
            <label className="flex-1 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">Blend mode</span>
              <Select value={blendMode} onValueChange={(val) => setBlendMode(val as BlendMode)}>
                <SelectTrigger className="w-full rounded-lg text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {BLEND_MODES.map((m) => (
                    <SelectItem key={m} value={m}>
                      {m.charAt(0) + m.slice(1).toLowerCase().replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
            <label className="w-28 space-y-1">
              <span className="text-xs font-medium text-muted-foreground">
                Opacity ({Math.round(opacity * 100)}%)
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={opacity}
                onChange={(e) => setOpacity(Number(e.target.value))}
                className="w-full"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Action row */}
      <div className="mt-3 flex items-center justify-end gap-2 border-t border-border pt-3">
        <Button
          variant="ghost"
          size="sm"
          onClick={handleDelete}
          disabled={deleting}
          className="text-red-600 hover:bg-red-50 hover:text-red-700"
        >
          {deleting ? 'Deleting…' : 'Delete'}
        </Button>
        <Button
          size="sm"
          onClick={handleSave}
          disabled={!isDirty || saving}
          variant={isDirty ? 'default' : 'secondary'}
        >
          {saving ? 'Saving…' : 'Save changes'}
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDeleteOpen}
        onOpenChange={setConfirmDeleteOpen}
        title={`Delete layer "${layer.displayName ?? layer.key}"?`}
        confirmLabel="Delete"
        destructive
        onConfirm={async () => {
          setDeleting(true);
          try {
            await onDelete(layer.id);
          } finally {
            setDeleting(false);
          }
        }}
      />
    </div>
  );
}

// ─── New Layer Upload Card ────────────────────────────────────────────────────

interface NewLayerCardProps {
  productId: string;
  viewId: string;
  existingCount: number;
  onUpload: (
    file: File,
    dto: {
      key: string;
      displayName?: string;
      layerType: TemplateLayerType;
      blendMode: BlendMode;
      opacity: number;
      zIndex: number;
    }
  ) => Promise<void>;
}

export function NewLayerCard({ productId, viewId, existingCount, onUpload }: NewLayerCardProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [layerType, setLayerType] = useState<TemplateLayerType>('BASE');
  const [blendMode, setBlendMode] = useState<BlendMode>('NORMAL');
  const [opacity, setOpacity] = useState(1);
  const [key, setKey] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    if (!key) {
      setKey(
        f.name
          .replace(/\.[^.]+$/, '')
          .replace(/[^a-z0-9_-]/gi, '_')
          .toLowerCase()
      );
    }
  };

  const handleSubmit = async () => {
    if (!file || !key.trim()) {
      setError('Please select an image and enter a layer key.');
      return;
    }
    setError(null);
    setUploading(true);
    try {
      await onUpload(file, {
        key: key.trim(),
        displayName: displayName.trim() || undefined,
        layerType,
        blendMode,
        opacity,
        zIndex: existingCount,
      });
      // Reset
      setFile(null);
      setPreview(null);
      setKey('');
      setDisplayName('');
      setLayerType('BASE');
      setBlendMode('NORMAL');
      setOpacity(1);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err: unknown) {
      const e = err as { message?: string };
      setError(e?.message ?? 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="rounded-xl border-2 border-dashed border-border bg-gray-50 p-4">
      <p className="mb-3 text-sm font-semibold text-foreground">Add layer</p>

      {/* File drop zone */}
      <div
        className="mb-3 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-border bg-white py-6 hover:bg-gray-50"
        onClick={() => fileRef.current?.click()}
      >
        {preview ? (
          <img src={preview} alt="Layer preview" className="h-28 w-auto object-contain" />
        ) : (
          <>
            <svg
              className="h-8 w-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 16v-8m0 0-3 3m3-3 3 3M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2"
              />
            </svg>
            <p className="text-sm text-muted-foreground">Click to upload PNG / WebP</p>
          </>
        )}
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/png,image/webp,image/jpeg"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Fields */}
      <div className="space-y-2">
        <input
          type="text"
          placeholder="Layer key (e.g. body_mask) *"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />
        <input
          type="text"
          placeholder="Display name (optional)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="w-full rounded-lg border border-border px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
        />

        <div className="flex gap-2">
          <Select value={layerType} onValueChange={(val) => setLayerType(val as TemplateLayerType)}>
            <SelectTrigger className="flex-1 rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LAYER_TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {LAYER_TYPE_LABELS[t]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={blendMode} onValueChange={(val) => setBlendMode(val as BlendMode)}>
            <SelectTrigger className="flex-1 rounded-lg text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {BLEND_MODES.map((m) => (
                <SelectItem key={m} value={m}>
                  {m.charAt(0) + m.slice(1).toLowerCase().replace(/_/g, ' ')}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Opacity ({Math.round(opacity * 100)}%)
          </span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={opacity}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-full"
          />
        </label>
      </div>

      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}

      <Button
        className="mt-3 w-full"
        onClick={handleSubmit}
        disabled={!file || !key.trim() || uploading}
      >
        {uploading ? 'Uploading…' : 'Upload & add layer'}
      </Button>
    </div>
  );
}
