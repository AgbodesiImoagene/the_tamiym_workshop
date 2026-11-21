'use client';

import { useEffect, useRef, useCallback } from 'react';
import { imageCrossOrigin } from '@/lib/designs';
import type { FabricJson, PrintArea, TemplateLayer, TemplateEffect } from '@/lib/designs';
import { isWorkshopFont, loadFontsForObjects } from '@/lib/workshop-fonts';
import { createLayerHistory, type LayerHistory } from './layer-history';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabricCanvas = any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FabricNS = any;

/** What the editor can ask the canvas to do. Filled in by WorkshopCanvas once it is ready. */
export interface WorkshopCanvasControls {
  /** Add a text layer built from a Fabric IText descriptor, and select it. */
  addText: (descriptor: Record<string, unknown>) => Promise<void>;
  /** Add an image layer built from a Fabric image descriptor (`src` required), and select it. */
  addImage: (descriptor: Record<string, unknown>) => Promise<void>;
  /** Delete the selected customer layers. Returns false when there was nothing to delete. */
  deleteSelected: () => boolean;
  /** Delete one customer layer by id. */
  deleteLayer: (layerId: string) => boolean;
  selectLayer: (layerId: string) => void;
  /** Move a customer layer one step up or down. Returns false at the edge of the stack. */
  moveLayer: (layerId: string, direction: 'up' | 'down') => boolean;
  undo: () => Promise<void>;
  redo: () => Promise<void>;
  /**
   * Resolves once every font a text on the canvas is waiting for has arrived and the text
   * has been measured and drawn again. The thumbnail waits for it.
   */
  fontsReady: () => Promise<void>;
  /** The canvas picture, for the thumbnail. */
  toDataURL: (options?: Record<string, unknown>) => string | null;
}

export interface WorkshopHistoryState {
  canUndo: boolean;
  canRedo: boolean;
}

interface WorkshopCanvasProps {
  viewKey: string;
  printArea: PrintArea | null;
  templateLayers: TemplateLayer[];
  activeEffects: TemplateEffect[];
  fabricJson: FabricJson | null;
  width?: number;
  height?: number;
  onLayersChange?: (json: FabricJson) => void;
  /** Called with the layer id of the selected customer layer, or null. */
  onSelectionChange?: (layerId: string | null) => void;
  onHistoryChange?: (state: WorkshopHistoryState) => void;
  /** True once the controls can be used (the layers are loaded), false when they are gone. */
  onReadyChange?: (ready: boolean) => void;
  /** Receives the canvas controls once the canvas is ready (editable canvases only). */
  controlRef?: { current: WorkshopCanvasControls | null };
  readOnly?: boolean;
}

const DEFAULT_SIZE = 600;
const SERIALISED_PROPS = ['designAssetId', 'data'];

let layerCounter = 0;
/** A unique id for a customer layer. Not a secret: it only tells layers apart. */
function newLayerId(): string {
  layerCounter += 1;
  return `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}-${layerCounter}`;
}

const isUserObject = (o: FabricCanvas): boolean => !o.data?.isTemplateLayer;
const getUserObjects = (canvas: FabricCanvas): FabricCanvas[] =>
  canvas.getObjects().filter(isUserObject);
/**
 * Fabric v6+ only honours the list of extra properties in `toObject(props)`: `toJSON()`
 * ignores it, which would drop `data` (layer id, asset id). `toJSON` is the fallback.
 */
const toPlain = (target: FabricCanvas): Record<string, unknown> =>
  typeof target.toObject === 'function'
    ? target.toObject(SERIALISED_PROPS)
    : target.toJSON(SERIALISED_PROPS);
const serialiseUserObjects = (canvas: FabricCanvas): Record<string, unknown>[] =>
  getUserObjects(canvas).map(toPlain);

/** Layers saved before layer ids existed get one when the view is loaded. */
function assignLayerIds(canvas: FabricCanvas) {
  getUserObjects(canvas).forEach((o: FabricCanvas) => {
    if (!o.data?.layerId) o.set({ data: { ...o.data, layerId: newLayerId() } });
  });
}

/**
 * WorkshopCanvas wraps a Fabric.js canvas. It:
 * - Renders template layers as non-interactive FabricImage objects at their zIndex/blendMode
 * - Applies option-value effects (TINT via BlendColor filter, REPLACE_IMAGE by swapping src)
 * - Clips user layers to the PrintArea bounds
 * - Fires `onLayersChange` on every modification with the serialised user-layer JSON
 * - Gives the editor controls to add, delete, select, reorder, undo and redo customer layers
 *
 * Template layers are always reconstructed from props — they are never in fabricJson, and
 * delete/undo/redo/reorder never touch them.
 * Fabric.js is imported dynamically (browser-only). Compatible with fabric v7 named exports.
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
  onSelectionChange,
  onHistoryChange,
  onReadyChange,
  controlRef,
  readOnly = false,
}: WorkshopCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<FabricCanvas>(null);
  const fabricModuleRef = useRef<FabricNS>(null);
  const lastJsonRef = useRef<string>('');
  const historyRef = useRef<LayerHistory | null>(null);
  // While true, canvas events are ignored: a batch of changes is reported once at its end.
  const silentRef = useRef(false);
  // While true, the reported change is a restore and must not become a new history entry.
  const restoringRef = useRef(false);
  const restoreQueueRef = useRef<Promise<void>>(Promise.resolve());
  const pendingRestoresRef = useRef(0);
  /** Fonts being waited for (TTW-103): the thumbnail waits for them via `fontsReady`. */
  const pendingFontsRef = useRef<Set<Promise<void>>>(new Set());

  // The Fabric listeners live as long as the canvas: they read the latest callbacks here.
  const onLayersChangeRef = useRef(onLayersChange);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const onHistoryChangeRef = useRef(onHistoryChange);
  const onReadyChangeRef = useRef(onReadyChange);
  useEffect(() => {
    onLayersChangeRef.current = onLayersChange;
    onSelectionChangeRef.current = onSelectionChange;
    onHistoryChangeRef.current = onHistoryChange;
    onReadyChangeRef.current = onReadyChange;
  });

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
    async (canvas: FabricCanvas, fabric: FabricNS) => {
      clearTemplateLayers(canvas);
      const ImageCtor = fabric.FabricImage ?? fabric.Image;

      for (const layer of [...templateLayers].sort((a, b) => a.zIndex - b.zIndex)) {
        const effect = getEffectForLayer(layer.id);
        const imageUrl =
          effect?.effectType === 'REPLACE_IMAGE' && effect.replacementImageUrl
            ? effect.replacementImageUrl
            : layer.imageUrl;

        if (!imageUrl) continue;

        const img = await ImageCtor.fromURL(imageUrl, {
          crossOrigin: 'anonymous',
        });
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
          const BlendColor = fabric.filters?.BlendColor ?? fabric.Image?.filters?.BlendColor;
          if (BlendColor) {
            img.filters = [
              new BlendColor({
                color: effect.tintHex,
                mode: 'tint',
                alpha: 0.6,
              }),
            ];
            img.applyFilters();
          }
        }

        canvas.add(img);
        if (typeof canvas.sendObjectToBack === 'function') {
          canvas.sendObjectToBack(img);
        } else if (typeof canvas.sendToBack === 'function') {
          canvas.sendToBack(img);
        }
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templateLayers, activeEffects, width, height]
  );

  const buildClipPath = useCallback(
    (canvas: FabricCanvas, fabric: FabricNS) => {
      if (!printArea) return;
      const Rect = fabric.Rect;
      const rect = new Rect({
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

  const notifyHistory = useCallback(() => {
    const history = historyRef.current;
    onHistoryChangeRef.current?.({
      canUndo: history?.canUndo() ?? false,
      canRedo: history?.canRedo() ?? false,
    });
  }, []);

  const emitChange = useCallback(
    (canvas: FabricCanvas) => {
      if (silentRef.current) return;
      assignLayerIds(canvas);
      const userJson = serialiseUserObjects(canvas);

      // Not yet recording while the first load is still running (historyRef is null).
      if (historyRef.current && !restoringRef.current) {
        historyRef.current.push(JSON.stringify(userJson));
        notifyHistory();
      }

      const onChange = onLayersChangeRef.current;
      if (!onChange) return;
      const json: FabricJson = {
        ...toPlain(canvas),
        objects: userJson,
      };
      const serialised = JSON.stringify(json);
      if (serialised === lastJsonRef.current) return;
      lastJsonRef.current = serialised;
      onChange(json);
    },
    [notifyHistory]
  );

  /** Run several canvas changes, then report them once (and record them unless restoring). */
  const applyBatch = useCallback(
    (canvas: FabricCanvas, change: () => void, recordInHistory: boolean) => {
      silentRef.current = true;
      try {
        change();
      } finally {
        silentRef.current = false;
      }
      restoringRef.current = !recordInHistory;
      try {
        emitChange(canvas);
      } finally {
        restoringRef.current = false;
      }
      canvas.requestRenderAll?.();
    },
    [emitChange]
  );

  /**
   * TTW-103: a font downloads the first time a text uses it, so a text is first measured and
   * drawn in the fallback font. When the font has arrived, forget the old measurements and
   * draw the text again, so the screen, the thumbnail and what is saved use the same font.
   * The new size is reported to the editor (so the saved width and height are the real ones)
   * but is not an undo step; nothing is reported when the size did not change.
   */
  const redrawAfterFonts = useCallback(
    (canvas: FabricCanvas, objects: FabricCanvas[]): Promise<void> => {
      const work = (async () => {
        try {
          const texts = objects.filter((o) => isWorkshopFont(o.fontFamily));
          if (!(await loadFontsForObjects(texts))) return;
          if (fabricRef.current !== canvas) return; // the canvas was rebuilt while loading
          const cache = fabricModuleRef.current?.cache;
          applyBatch(
            canvas,
            () => {
              texts.forEach((o) => {
                cache?.clearFontCache?.(o.fontFamily);
                o.initDimensions?.();
                o.setCoords?.();
                o.dirty = true;
              });
            },
            false
          );
        } catch {
          // A text that cannot be measured again keeps what it had; the editor goes on.
        }
      })();
      pendingFontsRef.current.add(work);
      void work.then(() => pendingFontsRef.current.delete(work));
      return work;
    },
    [applyBatch]
  );

  const addUserObjects = useCallback(
    (canvas: FabricCanvas, objects: FabricCanvas[]) => {
      objects.forEach((o) => {
        o.set({ selectable: !readOnly, evented: !readOnly });
        canvas.add(o);
      });
    },
    [readOnly]
  );

  const loadUserLayers = useCallback(
    async (canvas: FabricCanvas, fabric: FabricNS, json: FabricJson | null) => {
      if (!json || json.objects.length === 0) return;
      // Enliven + add rather than loadFromJSON: loadFromJSON would clear the template layers.
      const objects = await fabric.util.enlivenObjects(json.objects);
      if (fabricRef.current !== canvas) return; // the view changed while loading
      silentRef.current = true;
      try {
        addUserObjects(canvas, objects);
      } finally {
        silentRef.current = false;
      }
      canvas.requestRenderAll?.();
      canvas.renderAll?.();
      void redrawAfterFonts(canvas, objects);
    },
    [addUserObjects, redrawAfterFonts]
  );

  const restoreSnapshot = useCallback(
    async (canvas: FabricCanvas, fabric: FabricNS, snapshot: string) => {
      const items = JSON.parse(snapshot) as Record<string, unknown>[];
      const objects = items.length > 0 ? await fabric.util.enlivenObjects(items) : [];
      if (fabricRef.current !== canvas) return false; // the canvas was rebuilt meanwhile
      // Fabric silently drops an object it cannot load (an image whose URL no longer
      // answers). Restoring a partial state would lose a layer without a word: refuse.
      if (objects.length !== items.length) return false;
      applyBatch(
        canvas,
        () => {
          canvas.discardActiveObject?.();
          getUserObjects(canvas).forEach((o: FabricCanvas) => canvas.remove(o));
          addUserObjects(canvas, objects);
        },
        false
      );
      void redrawAfterFonts(canvas, objects);
      return true;
    },
    [applyBatch, addUserObjects, redrawAfterFonts]
  );

  const buildControls = useCallback(
    (canvas: FabricCanvas, fabric: FabricNS): WorkshopCanvasControls => {
      const findLayer = (layerId: string) =>
        getUserObjects(canvas).find((o: FabricCanvas) => o.data?.layerId === layerId);

      const removeObjects = (objects: FabricCanvas[]) => {
        if (objects.length === 0) return false;
        applyBatch(
          canvas,
          () => {
            canvas.discardActiveObject?.();
            objects.forEach((o) => canvas.remove(o));
          },
          true
        );
        return true;
      };

      const step = (direction: 'undo' | 'redo') => {
        // One restore at a time, in order, because enlivening objects is asynchronous.
        // The history only moves when its turn comes, so it always matches the canvas.
        pendingRestoresRef.current += 1;
        restoreQueueRef.current = restoreQueueRef.current.then(async () => {
          try {
            const history = historyRef.current;
            const snapshot = history ? history[direction]() : null;
            if (snapshot === null) return;
            notifyHistory();
            const restored = await restoreSnapshot(canvas, fabric, snapshot);
            if (!restored && historyRef.current) {
              // Nothing changed on the canvas: put the history back where it was.
              historyRef.current[direction === 'undo' ? 'redo' : 'undo']();
              notifyHistory();
            }
          } finally {
            pendingRestoresRef.current -= 1;
          }
        });
        return restoreQueueRef.current;
      };
      // While an undo or redo is still being applied, other changes would be recorded against
      // a canvas that is about to be replaced: they wait for the user to try again.
      const busy = () => pendingRestoresRef.current > 0;

      return {
        async addText(descriptor) {
          if (busy()) return;
          const { type: _type, text, data, ...options } = descriptor;
          void _type;
          const IText = fabric.IText ?? fabric.fabric?.IText;
          const itext = new IText(String(text ?? 'Text'), {
            ...options,
            data: { ...(data as object | undefined), layerId: newLayerId() },
          });
          canvas.add(itext);
          canvas.setActiveObject(itext);
          canvas.requestRenderAll?.();
          void redrawAfterFonts(canvas, [itext]);
        },

        async addImage(descriptor) {
          if (busy()) return;
          const { type: _type, src, data, ...options } = descriptor;
          void _type;
          const ImageCtor = fabric.FabricImage ?? fabric.Image ?? fabric.fabric?.Image;
          const imageSrc = String(src ?? '');
          // Private customer images need the session cookie (TTW-099).
          const img = await ImageCtor.fromURL(imageSrc, {
            crossOrigin: imageCrossOrigin(imageSrc),
          });
          if (fabricRef.current !== canvas) return; // the canvas was rebuilt while loading
          img.set({
            ...options,
            data: { ...(data as object | undefined), layerId: newLayerId() },
          });
          canvas.add(img);
          canvas.setActiveObject(img);
          canvas.requestRenderAll?.();
        },

        deleteSelected() {
          if (busy()) return false;
          const selected: FabricCanvas[] = canvas.getActiveObjects
            ? canvas.getActiveObjects()
            : [canvas.getActiveObject()].filter(Boolean);
          // Never delete a layer while its text is being typed.
          if (selected.some((o) => o.isEditing)) return false;
          return removeObjects(selected.filter(isUserObject));
        },

        deleteLayer(layerId) {
          if (busy()) return false;
          const layer = findLayer(layerId);
          return layer ? removeObjects([layer]) : false;
        },

        selectLayer(layerId) {
          const layer = findLayer(layerId);
          if (!layer) return;
          canvas.setActiveObject(layer);
          canvas.requestRenderAll?.();
        },

        moveLayer(layerId, direction) {
          if (busy()) return false;
          const layers = getUserObjects(canvas);
          const index = layers.findIndex((o: FabricCanvas) => o.data?.layerId === layerId);
          const target = direction === 'up' ? index + 1 : index - 1;
          // Stay among the customer layers: template layers sit below and are never crossed.
          if (index < 0 || target < 0 || target >= layers.length) return false;
          if (direction === 'up') canvas.bringObjectForward(layers[index]);
          else canvas.sendObjectBackwards(layers[index]);
          emitChange(canvas);
          canvas.requestRenderAll?.();
          return true;
        },

        async fontsReady() {
          // A redraw can start another load, so look again until nothing is pending.
          while (pendingFontsRef.current.size > 0) {
            await Promise.all([...pendingFontsRef.current]);
          }
        },

        undo: () => step('undo'),
        redo: () => step('redo'),

        toDataURL(options) {
          try {
            return canvas.toDataURL(options);
          } catch {
            return null;
          }
        },
      };
    },
    [applyBatch, emitChange, notifyHistory, redrawAfterFonts, restoreSnapshot]
  );

  // Initialise and tear down Fabric canvas
  useEffect(() => {
    if (!canvasRef.current || typeof window === 'undefined') return;

    let mounted = true;
    let readyReported = false;

    import('fabric').then((mod: FabricNS) => {
      if (!mounted || !canvasRef.current) return;

      // fabric v5: mod.fabric; fabric v7: named exports on mod
      const fabric = mod.fabric ?? mod;
      fabricModuleRef.current = fabric;

      const Canvas = fabric.Canvas;
      const canvas = new Canvas(canvasRef.current, {
        width,
        height,
        selection: !readOnly,
        preserveObjectStacking: true,
      });

      fabricRef.current = canvas;

      buildClipPath(canvas, fabric);

      if (!readOnly) {
        canvas.on('object:modified', () => emitChange(canvas));
        canvas.on('object:added', () => emitChange(canvas));
        canvas.on('object:removed', () => emitChange(canvas));

        const reportSelection = () => {
          // A drag-selection holds several objects: report the first customer layer so
          // that Delete stays available (deleteSelected removes all of them).
          const selected: FabricCanvas[] = canvas.getActiveObjects
            ? canvas.getActiveObjects()
            : [canvas.getActiveObject()].filter(Boolean);
          const layerId = selected.find(isUserObject)?.data?.layerId ?? null;
          onSelectionChangeRef.current?.(layerId);
        };
        canvas.on('selection:created', reportSelection);
        canvas.on('selection:updated', reportSelection);
        canvas.on('selection:cleared', reportSelection);
      }

      void (async () => {
        let templateError: unknown = null;
        try {
          await loadTemplateLayers(canvas, fabric);
        } catch (err) {
          templateError = err;
        }
        if (!mounted) return;
        await loadUserLayers(canvas, fabric, fabricJson);
        if (!mounted) return;

        // The loaded layers are the first history entry: undo never goes before them.
        assignLayerIds(canvas);
        historyRef.current = createLayerHistory(JSON.stringify(serialiseUserObjects(canvas)));
        emitChange(canvas);
        notifyHistory();
        if (!readOnly && controlRef) {
          controlRef.current = buildControls(canvas, fabric);
          readyReported = true;
          onReadyChangeRef.current?.(true);
        }
        if (templateError) throw templateError;
      })();
    });

    return () => {
      mounted = false;
      historyRef.current = null;
      if (controlRef) controlRef.current = null;
      if (readyReported) onReadyChangeRef.current?.(false);
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
      canvas.requestRenderAll?.();
      canvas.renderAll?.();
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
