'use client';

import type { TemplateLayer, BlendMode, PrintArea } from '@/lib/products';
import { BLEND_MODE_CSS } from '@/lib/products';

interface LayerCompositePreviewProps {
  layers: TemplateLayer[];
  printArea?: PrintArea | null;
  /** Natural size of the preview container in px (height). Default 400. */
  height?: number;
}

/**
 * Renders a live CSS composite of all template layers stacked in z-index order
 * using CSS mix-blend-mode. An optional print area rectangle is shown as a
 * dashed overlay so admins can see where user artwork will be placed.
 */
export function LayerCompositePreview({
  layers,
  printArea,
  height = 400,
}: LayerCompositePreviewProps) {
  const sorted = [...layers].sort((a, b) => a.zIndex - b.zIndex);

  if (sorted.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-xl border-2 border-dashed border-border bg-gray-50"
        style={{ height }}
      >
        <p className="text-sm text-muted-foreground">
          No layers uploaded yet
        </p>
      </div>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-xl border border-border bg-gray-100 shadow-inner"
      style={{ height, width: '100%' }}
    >
      {sorted.map((layer, i) => {
        const url =
          layer.imageUrl ??
          layer.image?.mediaAsset?.derivatives?.[0]?.url ??
          layer.image?.mediaAsset?.originalUrl;

        if (!url) return null;

        const blendCss =
          BLEND_MODE_CSS[layer.blendMode as BlendMode] ?? 'normal';

        return (
          <img
            key={layer.id}
            src={url}
            alt={layer.displayName ?? layer.key}
            className="absolute inset-0 h-full w-full object-contain"
            style={{
              zIndex: i + 1,
              opacity: layer.opacity,
              mixBlendMode: blendCss as React.CSSProperties['mixBlendMode'],
            }}
          />
        );
      })}

      {/* Print area overlay */}
      {printArea && (
        <div
          className="pointer-events-none absolute rounded border-2 border-dashed border-primary/70 bg-primary/5"
          style={{
            left: `${printArea.x * 100}%`,
            top: `${printArea.y * 100}%`,
            width: `${printArea.width * 100}%`,
            height: `${printArea.height * 100}%`,
            zIndex: 9999,
          }}
        >
          <span className="absolute -top-5 left-0 rounded bg-primary px-1.5 py-0.5 text-[10px] font-medium text-white">
            Print area
          </span>
        </div>
      )}
    </div>
  );
}
