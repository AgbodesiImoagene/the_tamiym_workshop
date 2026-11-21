'use client';

import { formatAdminDate } from '@/components/admin-shell';
import { formatBytes } from '@/lib/media';
import {
  PRINT_CANVAS_SIZE,
  apiPathHref,
  getOriginalFileLink,
  layerBox,
  printAreaInCanvas,
  type PrintFiles,
  type PrintImageLayer,
  type PrintLayer,
  type PrintView,
} from '@/lib/print-files';
import { Button } from '@tamiym/ui';
import { useState } from 'react';

/** One side of the design, drawn from the frozen layers: a layout preview, not a render. */
function SidePreview({ view }: { view: PrintView }) {
  const area = printAreaInCanvas(view.printArea);
  const [failed, setFailed] = useState<Set<string>>(new Set());

  return (
    <svg
      role="img"
      aria-label={`Layout preview of the ${view.displayName} side`}
      viewBox={`0 0 ${PRINT_CANVAS_SIZE} ${PRINT_CANVAS_SIZE}`}
      className="aspect-square w-full max-w-[320px] rounded-2xl border border-black/8 bg-white"
    >
      {area ? (
        <rect
          x={area.x}
          y={area.y}
          width={area.width}
          height={area.height}
          fill="none"
          stroke="currentColor"
          strokeDasharray="8 6"
          className="text-black/35"
        />
      ) : null}
      {view.layers.map((layer, index) => {
        const box = layerBox(layer);
        const transform = `rotate(${box.angle} ${box.pivotX} ${box.pivotY})`;
        if (layer.kind === 'image') {
          const href = apiPathHref(layer.previewPath);
          const broken = failed.has(layer.designAssetId);
          return (
            <g key={`${layer.designAssetId}-${index}`} transform={transform}>
              {href && !broken ? (
                <image
                  href={href}
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  preserveAspectRatio="none"
                  onError={() => setFailed((prev) => new Set(prev).add(layer.designAssetId))}
                />
              ) : (
                <rect
                  x={box.x}
                  y={box.y}
                  width={box.width}
                  height={box.height}
                  fill="none"
                  stroke="currentColor"
                  className="text-black/45"
                />
              )}
            </g>
          );
        }
        const fontSize = (layer.fontSize ?? 24) * (layer.scaleY ?? 1);
        return (
          <text
            key={`text-${index}`}
            transform={transform}
            x={box.x}
            y={box.y + fontSize}
            fontSize={fontSize}
            fontFamily={layer.fontFamily}
            fontWeight={layer.fontWeight}
            fill={layer.fill ?? 'currentColor'}
          >
            {layer.text.split('\n').map((line, lineIndex) => (
              <tspan key={lineIndex} x={box.x} dy={lineIndex === 0 ? 0 : fontSize * 1.16}>
                {line}
              </tspan>
            ))}
          </text>
        );
      })}
    </svg>
  );
}

function OriginalFile({ layer }: { layer: PrintImageLayer }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setBusy(true);
    setError(null);
    try {
      const { url } = await getOriginalFileLink(layer.originalLinkPath);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      anchor.click();
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : 'We could not get the original file.'
      );
    } finally {
      setBusy(false);
    }
  }

  const file = layer.file;
  return (
    <div className="space-y-2">
      <p className="text-xs text-black/60">
        {file
          ? [
              file.mimeType,
              file.width && file.height ? `${file.width} × ${file.height} px` : null,
              file.bytes != null ? formatBytes(file.bytes) : null,
            ]
              .filter(Boolean)
              .join(' · ')
          : 'This file is no longer available.'}
      </p>
      {file ? (
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={download}>
          {busy ? 'Preparing link...' : 'Open original file'}
        </Button>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function layerPosition(layer: PrintLayer) {
  const box = layerBox(layer);
  const round = (n: number) => Math.round(n);
  const turn = box.angle ? `, turned ${round(box.angle)}°` : '';
  return `x ${round(box.x)}, y ${round(box.y)} · ${round(box.width)} × ${round(box.height)} px${turn}`;
}

/** The print shop section of an admin order item (TTW-101). */
export function OrderPrintFiles({ printFiles }: { printFiles: PrintFiles | null | undefined }) {
  if (!printFiles) {
    return (
      <p data-testid="print-files-missing" className="text-xs text-black/55">
        Print files were not recorded for this item.
      </p>
    );
  }

  return (
    <section
      aria-label={`Print files for ${printFiles.designName}`}
      data-testid="print-files"
      className="mt-4 space-y-4 border-t border-black/8 pt-4"
    >
      <div>
        <h3 className="text-sm font-semibold text-tamiym-blue">Print files</h3>
        <p className="text-xs text-black/55">
          {printFiles.designName} · frozen when the order was placed (
          {formatAdminDate(printFiles.capturedAt)}). Later edits to the design do not change it.
        </p>
      </div>
      {printFiles.views.length === 0 ? (
        <p className="text-xs text-black/55">The design had no printable layer.</p>
      ) : (
        printFiles.views.map((view) => (
          <div
            key={view.key}
            data-testid={`print-side-${view.key}`}
            className="grid gap-4 md:grid-cols-[320px_minmax(0,1fr)]"
          >
            <div className="space-y-2">
              <h4 className="text-sm font-semibold text-black/80">{view.displayName}</h4>
              <SidePreview view={view} />
              {view.printArea ? null : (
                <p className="text-xs text-black/55">No print area is set for this side.</p>
              )}
            </div>
            <ul className="space-y-3">
              {view.layers.map((layer, index) => (
                <li
                  key={index}
                  className="rounded-2xl border border-black/8 bg-white p-3 text-sm text-black/75"
                >
                  <p className="font-semibold">
                    {layer.kind === 'image' ? 'Image' : `Text: “${layer.text}”`}
                  </p>
                  <p className="text-xs text-black/60">{layerPosition(layer)}</p>
                  {layer.kind === 'image' ? <OriginalFile layer={layer} /> : null}
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  );
}
