'use client';

import { useEffect, useRef, useCallback } from 'react';
import type { FabricJson, PrintArea, TemplateLayer, TemplateEffect } from '@/lib/designs';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabricModule = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabricCanvas = any;

interface WorkshopCanvasProps {
  viewKey: string;
  printArea: PrintArea | null;
  templateLayers: TemplateLayer[];
  activeEffects: TemplateEffect[];
  fabricJson: FabricJson | null;
  width?: number;
  height?: number;
  onLayersChange?: (json: FabricJson) => void;
  readOnly?: boolean;
}

const DEFAULT_SIZE = 600;

/**
 * WorkshopCanvas wraps a Fabric.js canvas. It:
 * - Renders template layers as non-interactive fabric.Image objects at their zIndex/blendMode
 * - Applies option-value effects (TINT via BlendColor filter, REPLACE_IMAGE by swapping src)
 * - Clips user layers to the PrintArea bounds
 * - Fires `onLayersChange` on every modification with the serialised user-layer JSON
 *
 * Template layers are always reconstructed from props — they are never in fabricJson.
 * Fabric.js is imported dynamically (browser-only).
 */
export default function WorkshopCanvas({
  viewKey,
  printArea,
  templateLayers,
  activeEffects,
  fabricJson,
  width = DEFAULT_SIZE,
  height = DEFAULT_SIZE,
  onLayersChange,
  readOnly = false,
}: WorkshopCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas>(null);
  const fabricModuleRef = useRef<FabricModule>(null);
  const lastJsonRef = useRef<string>('');

  const buildLayerKey = (layerId: string) => `__template_${layerId}`;

  const clearTemplateLayers = useCallback((canvas: FabricCanvas) => {
    const toRemove = canvas.getObjects().filter((o: FabricCanvas) => o.data?.isTemplateLayer);
    toRemove.forEach((o: FabricCanvas) => canvas.remove(o));
  }, []);

  const getEffectForLayer = useCallback(
    (layerId: string) => activeEffects.find((e) => e.templateLayerId === layerId) ?? null,
    [activeEffects]
  );

  const loadTemplateLayers = useCallback(
    async (canvas: FabricCanvas, fabric: FabricModule) => {
      clearTemplateLayers(canvas);

      for (const layer of [...templateLayers].sort((a, b) => a.zIndex - b.zIndex)) {
        const effect = getEffectForLayer(layer.id);
        const imageUrl =
          effect?.effectType === 'REPLACE_IMAGE' && effect.replacementImageUrl
            ? effect.replacementImageUrl
            : layer.imageUrl;

        if (!imageUrl) continue;

        await new Promise<void>((resolve) => {
          fabric.Image.fromURL(
            imageUrl,
            (img: FabricCanvas) => {
              img.set({
                left: 0,
                top: 0,
                scaleX: width / (img.width || width),
                scaleY: height / (img.height || height),
                selectable: false,
                evented: false,
                opacity: layer.opacity,
                globalCompositeOperation: blendModeToComposite(layer.blendMode),
                data: { isTemplateLayer: true, layerKey: buildLayerKey(layer.id) },
              });

              if (effect?.effectType === 'TINT' && effect.tintHex) {
                const filter = new fabric.Image.filters.BlendColor({
                  color: effect.tintHex,
                  mode: 'tint',
                  alpha: 0.6,
                });
                img.filters = [filter];
                img.applyFilters();
              }

              canvas.add(img);
              canvas.sendToBack(img);
              resolve();
            },
            { crossOrigin: 'anonymous' }
          );
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templateLayers, activeEffects, width, height]
  );

  const loadUserLayers = useCallback(
    async (canvas: FabricCanvas, json: FabricJson | null) => {
      if (!json || json.objects.length === 0) return;

      await new Promise<void>((resolve) => {
        canvas.loadFromJSON({ ...json }, () => {
          canvas.getObjects().forEach((o: FabricCanvas) => {
            if (!o.data?.isTemplateLayer) {
              o.set({ selectable: !readOnly, evented: !readOnly });
            }
          });
          canvas.renderAll();
          resolve();
        });
      });
    },
    [readOnly]
  );

  const buildClipPath = useCallback(
    (canvas: FabricCanvas, fabric: FabricModule) => {
      if (!printArea) return;
      const rect = new fabric.Rect({
        left: printArea.x * width,
        top: printArea.y * height,
        width: printArea.width * width,
        height: printArea.height * height,
        absolutePositioned: true,
      });
      canvas.clipPath = rect;
    },
    [printArea, width, height]
  );

  const emitChange = useCallback(
    (canvas: FabricCanvas) => {
      if (!onLayersChange) return;
      const userObjects = canvas.getObjects().filter((o: FabricCanvas) => !o.data?.isTemplateLayer);

      const json: FabricJson = {
        ...canvas.toJSON(['designAssetId', 'data']),
        objects: userObjects.map(
          (o: FabricCanvas) => o.toJSON(['designAssetId', 'data']) as Record<string, unknown>
        ),
      };
      const serialised = JSON.stringify(json);
      if (serialised === lastJsonRef.current) return;
      lastJsonRef.current = serialised;
      onLayersChange(json);
    },
    [onLayersChange]
  );

  // Initialise and tear down Fabric canvas
  useEffect(() => {
    if (!canvasRef.current || typeof window === 'undefined') return;

    let mounted = true;

    import('fabric').then((mod: FabricModule) => {
      if (!mounted || !canvasRef.current) return;

      // fabric v5 exports as mod.fabric
      const fabric = mod.fabric ?? mod;
      fabricModuleRef.current = fabric;

      const canvas = new fabric.Canvas(canvasRef.current, {
        width,
        height,
        selection: !readOnly,
        preserveObjectStacking: true,
      });

      fabricRef.current = canvas;

      buildClipPath(canvas, fabric);

      loadTemplateLayers(canvas, fabric).then(() => {
        if (!mounted) return;
        return loadUserLayers(canvas, fabricJson);
      });

      if (!readOnly) {
        canvas.on('object:modified', () => emitChange(canvas));
        canvas.on('object:added', () => emitChange(canvas));
        canvas.on('object:removed', () => emitChange(canvas));
      }
    });

    return () => {
      mounted = false;
      if (fabricRef.current) {
        fabricRef.current.dispose();
        fabricRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewKey, width, height, readOnly]);

  // Re-apply template layers when effects or template layers change
  useEffect(() => {
    const canvas = fabricRef.current;
    const fabric = fabricModuleRef.current;
    if (!canvas || !fabric) return;
    loadTemplateLayers(canvas, fabric).then(() => {
      canvas.renderAll();
    });
  }, [loadTemplateLayers]);

  return (
    <div className="relative overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <canvas ref={canvasRef} key={viewKey} style={{ width, height, display: 'block' }} />
    </div>
  );
}

function blendModeToComposite(blendMode: string): GlobalCompositeOperation {
  const map: Record<string, GlobalCompositeOperation> = {
    NORMAL: 'source-over',
    MULTIPLY: 'multiply',
    SCREEN: 'screen',
    OVERLAY: 'overlay',
    DARKEN: 'darken',
    LIGHTEN: 'lighten',
    COLOR_DODGE: 'color-dodge',
    COLOR_BURN: 'color-burn',
    HARD_LIGHT: 'hard-light',
    SOFT_LIGHT: 'soft-light',
    DIFFERENCE: 'difference',
    EXCLUSION: 'exclusion',
  };
  return map[blendMode] ?? 'source-over';
}
