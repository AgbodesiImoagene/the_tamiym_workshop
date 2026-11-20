'use client';

import { Button, cn } from '@tamiym/ui';

export interface LayerItem {
  id: string;
  label: string;
  kind: 'text' | 'image' | 'other';
}

export type LayerMoveDirection = 'up' | 'down';

interface LayerListProps {
  /** Layers in stacking order, bottom first (the Fabric order). */
  layers: LayerItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
  onMove: (id: string, direction: LayerMoveDirection) => void;
  /** True while the canvas cannot act on the layers yet (it is still loading them). */
  disabled?: boolean;
}

const KIND_LABEL: Record<LayerItem['kind'], string> = {
  text: 'Text',
  image: 'Image',
  other: 'Layer',
};

/**
 * List of the customer's layers for the active view, top layer first.
 * Template layers are not listed: they cannot be edited, moved or deleted.
 */
export default function LayerList({
  layers,
  selectedId,
  onSelect,
  onDelete,
  onMove,
  disabled = false,
}: LayerListProps) {
  const topFirst = [...layers].reverse();

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <h3 className="text-sm font-semibold text-card-foreground">Layers</h3>

      {topFirst.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          No layers yet. Add text or an image to get started.
        </p>
      ) : (
        <ul aria-label="Layers" className="flex flex-col gap-1">
          {topFirst.map((layer, position) => {
            const selected = layer.id === selectedId;
            return (
              <li
                key={layer.id}
                className={cn(
                  'flex items-center gap-1 rounded-lg border border-transparent px-1 py-0.5',
                  selected && 'border-border bg-accent text-accent-foreground'
                )}
              >
                <button
                  type="button"
                  aria-label={`Select ${layer.label}`}
                  aria-pressed={selected}
                  disabled={disabled}
                  onClick={() => onSelect(layer.id)}
                  className="flex min-w-0 flex-1 flex-col items-start rounded px-1 py-0.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="w-full truncate">{layer.label}</span>
                  <span className="text-xs text-muted-foreground">{KIND_LABEL[layer.kind]}</span>
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${layer.label} up`}
                  disabled={disabled || position === 0}
                  onClick={() => onMove(layer.id, 'up')}
                >
                  ↑
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Move ${layer.label} down`}
                  disabled={disabled || position === topFirst.length - 1}
                  onClick={() => onMove(layer.id, 'down')}
                >
                  ↓
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Delete ${layer.label}`}
                  disabled={disabled}
                  onClick={() => onDelete(layer.id)}
                >
                  ✕
                </Button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
