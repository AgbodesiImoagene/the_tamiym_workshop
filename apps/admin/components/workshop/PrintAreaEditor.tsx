'use client';

import { useCallback, useRef, useState } from 'react';
import type { PrintArea } from '@/lib/products';
import { Button } from '@tamiym/ui';

interface PrintAreaEditorProps {
  baseImageUrl?: string | null;
  printArea?: PrintArea | null;
  onSave: (area: { x: number; y: number; width: number; height: number }) => Promise<void>;
  isSaving?: boolean;
}

type Handle = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 's' | 'w' | 'e' | 'move';

interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Visual print area editor. Shows the product base image with an interactive
 * rectangle overlay. Handles are drag-resizable. Coordinates stored as [0..1]
 * normalised fractions relative to the container dimensions.
 */
export function PrintAreaEditor({
  baseImageUrl,
  printArea,
  onSave,
  isSaving,
}: PrintAreaEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const [rect, setRect] = useState<Rect>(
    printArea ?? { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  );

  // Numeric inputs state (string so we can type freely)
  const [xInput, setXInput] = useState(String(Math.round(rect.x * 100)));
  const [yInput, setYInput] = useState(String(Math.round(rect.y * 100)));
  const [wInput, setWInput] = useState(String(Math.round(rect.width * 100)));
  const [hInput, setHInput] = useState(String(Math.round(rect.height * 100)));

  const [maxLayers, setMaxLayers] = useState<string>(
    printArea?.maxLayers != null ? String(printArea.maxLayers) : '',
  );
  const [maxColors, setMaxColors] = useState<string>(
    printArea?.maxColors != null ? String(printArea.maxColors) : '',
  );
  const [rotationAllowed, setRotationAllowed] = useState(
    printArea?.rotationAllowed ?? false,
  );

  const syncInputs = (r: Rect) => {
    setXInput(String(Math.round(r.x * 100)));
    setYInput(String(Math.round(r.y * 100)));
    setWInput(String(Math.round(r.width * 100)));
    setHInput(String(Math.round(r.height * 100)));
  };

  const startDrag = useCallback(
    (e: React.PointerEvent, handle: Handle) => {
      e.preventDefault();
      const container = containerRef.current;
      if (!container) return;

      const bounds = container.getBoundingClientRect();
      const startX = e.clientX;
      const startY = e.clientY;
      const startRect = { ...rect };

      const onMove = (ev: PointerEvent) => {
        const dx = (ev.clientX - startX) / bounds.width;
        const dy = (ev.clientY - startY) / bounds.height;
        let { x, y, width, height } = startRect;

        if (handle === 'move') {
          x = clamp(x + dx, 0, 1 - width);
          y = clamp(y + dy, 0, 1 - height);
        } else {
          const minSide = 0.05;
          if (handle.includes('e')) {
            width = clamp(width + dx, minSide, 1 - x);
          }
          if (handle.includes('s')) {
            height = clamp(height + dy, minSide, 1 - y);
          }
          if (handle.includes('w')) {
            const newX = clamp(x + dx, 0, x + width - minSide);
            width = width + (x - newX);
            x = newX;
          }
          if (handle.includes('n')) {
            const newY = clamp(y + dy, 0, y + height - minSide);
            height = height + (y - newY);
            y = newY;
          }
        }

        const next = { x, y, width, height };
        setRect(next);
        syncInputs(next);
      };

      const onUp = () => {
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
      };

      window.addEventListener('pointermove', onMove);
      window.addEventListener('pointerup', onUp);
    },
    [rect],
  );

  const applyInputs = () => {
    const next = {
      x: clamp(Number(xInput) / 100, 0, 0.95),
      y: clamp(Number(yInput) / 100, 0, 0.95),
      width: clamp(Number(wInput) / 100, 0.05, 1),
      height: clamp(Number(hInput) / 100, 0.05, 1),
    };
    next.width = clamp(next.width, 0.05, 1 - next.x);
    next.height = clamp(next.height, 0.05, 1 - next.y);
    setRect(next);
    syncInputs(next);
  };

  const handleSave = async () => {
    await onSave({
      ...rect,
      ...(maxLayers ? { maxLayers: Number(maxLayers) } : {}),
      ...(maxColors ? { maxColors: Number(maxColors) } : {}),
      rotationAllowed,
    } as Parameters<typeof onSave>[0]);
  };

  const HANDLE_POSITIONS: Record<Handle, { top: string; left: string; cursor: string }> = {
    nw: { top: '-5px', left: '-5px', cursor: 'nw-resize' },
    ne: { top: '-5px', left: 'calc(100% - 5px)', cursor: 'ne-resize' },
    sw: { top: 'calc(100% - 5px)', left: '-5px', cursor: 'sw-resize' },
    se: { top: 'calc(100% - 5px)', left: 'calc(100% - 5px)', cursor: 'se-resize' },
    n: { top: '-5px', left: 'calc(50% - 5px)', cursor: 'n-resize' },
    s: { top: 'calc(100% - 5px)', left: 'calc(50% - 5px)', cursor: 's-resize' },
    w: { top: 'calc(50% - 5px)', left: '-5px', cursor: 'w-resize' },
    e: { top: 'calc(50% - 5px)', left: 'calc(100% - 5px)', cursor: 'e-resize' },
    move: { top: '0', left: '0', cursor: 'move' },
  };

  return (
    <div className="space-y-5">
      {/* Canvas */}
      <div
        ref={containerRef}
        className="relative overflow-hidden rounded-xl border border-border bg-gray-100"
        style={{ paddingTop: '75%' }}
      >
        <div className="absolute inset-0">
          {baseImageUrl ? (
            <img
              src={baseImageUrl}
              alt="Product base"
              className="h-full w-full object-contain"
              draggable={false}
            />
          ) : (
            <div className="flex h-full items-center justify-center">
              <p className="text-sm text-muted-foreground">
                No base image — upload a BASE layer first
              </p>
            </div>
          )}

          {/* Overlay */}
          <div
            className="absolute border-2 border-primary bg-primary/10"
            style={{
              left: `${rect.x * 100}%`,
              top: `${rect.y * 100}%`,
              width: `${rect.width * 100}%`,
              height: `${rect.height * 100}%`,
            }}
          >
            {/* Move handle — covers the full rect */}
            <div
              className="absolute inset-0"
              style={{ cursor: 'move' }}
              onPointerDown={(e) => startDrag(e, 'move')}
            />

            {/* Resize handles */}
            {(Object.entries(HANDLE_POSITIONS) as [Handle, (typeof HANDLE_POSITIONS)[Handle]][])
              .filter(([h]) => h !== 'move')
              .map(([handle, pos]) => (
                <div
                  key={handle}
                  className="absolute h-3 w-3 rounded-sm border-2 border-primary bg-white shadow"
                  style={{ ...pos, cursor: pos.cursor }}
                  onPointerDown={(e) => startDrag(e, handle)}
                />
              ))}
          </div>
        </div>
      </div>

      {/* Numeric inputs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            { label: 'X (%)', value: xInput, set: setXInput },
            { label: 'Y (%)', value: yInput, set: setYInput },
            { label: 'W (%)', value: wInput, set: setWInput },
            { label: 'H (%)', value: hInput, set: setHInput },
          ] as const
        ).map(({ label, value, set }) => (
          <label key={label} className="space-y-1">
            <span className="text-xs font-medium text-muted-foreground">
              {label}
            </span>
            <input
              type="number"
              min={1}
              max={100}
              value={value}
              onChange={(e) => set(e.target.value)}
              onBlur={applyInputs}
              onKeyDown={(e) => e.key === 'Enter' && applyInputs()}
              className="w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
            />
          </label>
        ))}
      </div>

      {/* Constraints */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Max layers
          </span>
          <input
            type="number"
            min={1}
            placeholder="Unlimited"
            value={maxLayers}
            onChange={(e) => setMaxLayers(e.target.value)}
            className="w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </label>
        <label className="space-y-1">
          <span className="text-xs font-medium text-muted-foreground">
            Max colors
          </span>
          <input
            type="number"
            min={1}
            placeholder="Unlimited"
            value={maxColors}
            onChange={(e) => setMaxColors(e.target.value)}
            className="w-full rounded-lg border border-border px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
          />
        </label>
        <label className="flex items-center gap-2 pt-5">
          <input
            type="checkbox"
            checked={rotationAllowed}
            onChange={(e) => setRotationAllowed(e.target.checked)}
            className="h-4 w-4 rounded border-border"
          />
          <span className="text-sm text-foreground">Allow rotation</span>
        </label>
      </div>

      <Button onClick={handleSave} disabled={isSaving} className="w-full">
        {isSaving ? 'Saving…' : 'Save print area'}
      </Button>
    </div>
  );
}
