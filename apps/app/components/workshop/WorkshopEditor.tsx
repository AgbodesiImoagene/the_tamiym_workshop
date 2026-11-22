'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@tamiym/ui';
import ViewTabs from './ViewTabs';
import WorkshopToolRail, { type WorkshopTool } from './WorkshopToolRail';
import TextTool from './TextTool';
import ImageTool from './ImageTool';
import OptionPicker from './OptionPicker';
import SavePanel from './SavePanel';
import SharePanel from './SharePanel';
import { isLowResolutionImage, DEFAULT_CANVAS_SIZE } from '@/lib/image-resolution';
import { useMediaQuery } from '@/lib/use-media-query';
import LayerList, { type LayerItem } from './LayerList';
import type { WorkshopCanvasControls, WorkshopHistoryState } from './WorkshopCanvas';
import {
  createDesign,
  updateDesign,
  uploadThumbnail,
  type Design,
  type DesignData,
  type WorkshopContext,
  type TemplateEffect,
  type FabricJson,
} from '@/lib/designs';

/** How long a thumbnail waits for fonts before it is taken anyway (TTW-103). */
const FONTS_WAIT_MS = 3000;

// Load WorkshopCanvas client-side only (Fabric.js requires a DOM)
const WorkshopCanvas = dynamic(() => import('./WorkshopCanvas'), { ssr: false });

interface WorkshopEditorProps {
  workshopContext: WorkshopContext;
  /** Existing design when editing; undefined when creating */
  existingDesign?: Design;
}

const AUTOSAVE_DELAY_MS = 3000;

/**
 * Top-level Design Workshop editor shell.
 * Manages:
 * - `designData` with per-view Fabric.js JSON
 * - `selectedOptions` and derived active effects per view
 * - Save (create / update) with thumbnail capture
 * - Auto-save on inactivity
 */
export default function WorkshopEditor({ workshopContext, existingDesign }: WorkshopEditorProps) {
  const router = useRouter();
  // Tailwind `md`: below it the card is one column and the canvas comes first.
  const isMdUp = useMediaQuery('(min-width: 768px)', true);
  const { product, views } = workshopContext;
  const designableViews = views.filter((v) => v.isDesignable);

  // Use the first designable view as the default active view
  const defaultView = designableViews.find((v) => v.isDefault) ?? designableViews[0];

  const [activeViewKey, setActiveViewKey] = useState(defaultView?.key ?? '');
  const [designId, setDesignId] = useState<string | undefined>(existingDesign?.id);
  const [designName, setDesignName] = useState(existingDesign?.name ?? 'My Design');
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [activeEffects, setActiveEffects] = useState<TemplateEffect[]>([]);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string>>({});
  const [activeTool, setActiveTool] = useState<WorkshopTool>('text');
  const tools: WorkshopTool[] =
    product.options.length > 0 ? ['upload', 'text', 'colors'] : ['upload', 'text'];

  // Initialise designData from existing design or empty
  const [designData, setDesignData] = useState<DesignData>(() => {
    if (existingDesign?.designData) {
      return existingDesign.designData as DesignData;
    }
    const views: DesignData['views'] = {};
    for (const view of designableViews) {
      views[view.key] = {
        productViewId: view.id,
        fabricJson: { objects: [] },
        isUsed: false,
        layerCount: 0,
      };
    }
    return { version: 1, productId: product.id, views };
  });

  // Controls of the active canvas (add, delete, undo, ...), filled in by WorkshopCanvas
  const controlRef = useRef<WorkshopCanvasControls | null>(null);
  const [selectedLayerId, setSelectedLayerId] = useState<string | null>(null);
  const [canvasReady, setCanvasReady] = useState(false);
  const [history, setHistory] = useState<WorkshopHistoryState>({ canUndo: false, canRedo: false });

  // Auto-save timer
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Latest save handler, so the timer saves the current design rather than the one
  // captured when it was scheduled.
  const handleSaveRef = useRef<(withThumbnail?: boolean) => Promise<void>>(async () => {});

  const scheduleAutoSave = useCallback(() => {
    if (!designId) return; // Only auto-save after first explicit save
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      void handleSaveRef.current(false);
    }, AUTOSAVE_DELAY_MS);
  }, [designId]);

  // Clear autosave on unmount
  useEffect(() => {
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, []);

  const handleLayersChange = useCallback(
    (viewKey: string, fabricJson: FabricJson) => {
      setDesignData((prev) => ({
        ...prev,
        views: {
          ...prev.views,
          [viewKey]: {
            ...prev.views[viewKey],
            fabricJson,
            isUsed: fabricJson.objects.length > 0,
            layerCount: fabricJson.objects.length,
          },
        },
      }));
      scheduleAutoSave();
    },
    [scheduleAutoSave]
  );

  const handleOptionChange = useCallback(
    (optionId: string, optionValueId: string, newEffects: TemplateEffect[]) => {
      setSelectedOptions((prev) => ({ ...prev, [optionId]: optionValueId }));
      setActiveEffects(newEffects);
    },
    []
  );

  const captureThumbnail = useCallback(async (): Promise<Blob | null> => {
    try {
      // TTW-103: the picture must show the fonts, not the fallback while they download.
      // A font request that never answers must not block saving: wait a few seconds at most.
      let giveUp: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        Promise.all([controlRef.current?.fontsReady?.(), document.fonts?.ready]),
        new Promise((resolve) => {
          giveUp = setTimeout(resolve, FONTS_WAIT_MS);
        }),
      ]);
      clearTimeout(giveUp);
      const dataUrl = controlRef.current?.toDataURL({
        format: 'webp',
        quality: 0.8,
      });
      if (!dataUrl) return null;
      const res = await fetch(dataUrl);
      return res.blob();
    } catch {
      return null;
    }
  }, []);

  const handleSave = useCallback(
    async (withThumbnail = true) => {
      if (isSaving) return;
      setIsSaving(true);
      setSaveError(null);

      try {
        let savedDesign: Design;

        if (designId) {
          savedDesign = await updateDesign(designId, {
            name: designName,
            designData,
          });
        } else {
          savedDesign = await createDesign({
            name: designName,
            productId: product.id,
            designData,
          });
          setDesignId(savedDesign.id);
          // Navigate to the edit route after first save
          router.replace(`/dashboard/design/${savedDesign.id}/edit`);
        }

        // Upload thumbnail from active canvas
        if (withThumbnail && savedDesign) {
          const blob = await captureThumbnail();
          if (blob) {
            await uploadThumbnail(savedDesign.id, blob).catch(() => {
              // Non-fatal — thumbnail upload failure should not block save
            });
          }
        }
      } catch (err: unknown) {
        const message =
          err && typeof err === 'object' && 'message' in err
            ? String((err as { message: unknown }).message)
            : 'Save failed';
        setSaveError(message);
      } finally {
        setIsSaving(false);
      }
    },
    [isSaving, designId, designName, designData, product.id, router, captureThumbnail]
  );

  useEffect(() => {
    handleSaveRef.current = handleSave;
  }, [handleSave]);

  // The canvas shows only the print area, so a new layer starts at its centre (a layer is
  // positioned by its centre). Without a print area the tool's own start position is kept.
  const placeAtPrintAreaCentre = useCallback(
    (layer: Record<string, unknown>): Record<string, unknown> => {
      const printArea = views.find((v) => v.key === activeViewKey)?.printArea;
      if (!printArea) return layer;
      return {
        ...layer,
        left: Math.round((printArea.x + printArea.width / 2) * DEFAULT_CANVAS_SIZE),
        top: Math.round((printArea.y + printArea.height / 2) * DEFAULT_CANVAS_SIZE),
      };
    },
    [views, activeViewKey]
  );

  const handleAddText = useCallback(
    (textObject: Record<string, unknown>) => {
      void controlRef.current?.addText(placeAtPrintAreaCentre(textObject));
    },
    [placeAtPrintAreaCentre]
  );

  const handleAddImage = useCallback(
    (imageObject: Record<string, unknown>) => {
      void controlRef.current?.addImage(placeAtPrintAreaCentre(imageObject));
    },
    [placeAtPrintAreaCentre]
  );

  const handleDelete = useCallback(() => {
    controlRef.current?.deleteSelected();
  }, []);
  const handleUndo = useCallback(() => {
    void controlRef.current?.undo();
  }, []);
  const handleRedo = useCallback(() => {
    void controlRef.current?.redo();
  }, []);

  // The canvas is rebuilt on every view change: selection and history start again.
  const handleViewChange = useCallback((viewKey: string) => {
    setSelectedLayerId(null);
    setHistory({ canUndo: false, canRedo: false });
    setActiveViewKey(viewKey);
  }, []);

  // Delete / Backspace remove the selected layer, Ctrl/Cmd+Z undoes, +Shift (or Y) redoes.
  // Never while typing in a field, including Fabric's own text editor (a hidden textarea).
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest?.('input, textarea, select, [contenteditable="true"]')) return;

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedLayerId) {
        event.preventDefault();
        controlRef.current?.deleteSelected();
        return;
      }
      if (!(event.ctrlKey || event.metaKey)) return;
      const key = event.key.toLowerCase();
      if (key === 'z' && !event.shiftKey && history.canUndo) {
        event.preventDefault();
        void controlRef.current?.undo();
      } else if (((key === 'z' && event.shiftKey) || key === 'y') && history.canRedo) {
        event.preventDefault();
        void controlRef.current?.redo();
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [selectedLayerId, history]);

  const activeView = designableViews.find((v) => v.key === activeViewKey);

  // A stable array: a new one on every render would make the canvas reload the template
  // layers each time the selection or the history changes.
  const activeViewEffects = useMemo(
    () => (activeView?.effects ?? []).filter((e) => activeEffects.some((ae) => ae.id === e.id)),
    [activeView, activeEffects]
  );

  const layerItems = useMemo<LayerItem[]>(() => {
    const objects = designData.views[activeViewKey]?.fabricJson?.objects ?? [];
    return objects.flatMap((o): LayerItem[] => {
      const layerId = (o.data as { layerId?: string } | undefined)?.layerId;
      if (!layerId) return [];
      // Fabric v7 writes "IText", "Textbox", "FabricImage"; older saves may hold "i-text".
      const type = String(o.type ?? '').toLowerCase();
      if (type.includes('text')) {
        return [
          { id: layerId, label: String(o.text ?? '').trim() || 'Text', kind: 'text' as const },
        ];
      }
      if (type.includes('image')) {
        return [
          {
            id: layerId,
            label: 'Image',
            kind: 'image' as const,
            lowResolution: isLowResolutionImage(
              o as { scaleX?: unknown; scaleY?: unknown },
              activeView?.printArea ?? null
            ),
          },
        ];
      }
      return [{ id: layerId, label: 'Layer', kind: 'other' as const }];
    });
  }, [designData, activeViewKey, activeView]);

  // The explanation next to the canvas is for the selected image only.
  const selectedLowResolution = layerItems.some((l) => l.id === selectedLayerId && l.lowResolution);

  // The open tool, then the parts that do not depend on the tool.
  const toolPanel = (
    <div
      key="tools"
      className="flex w-full flex-col gap-4 overflow-y-auto border-t border-border bg-background p-4 md:w-72 md:shrink-0 md:border-t-0 md:border-r"
    >
      {/* The tools stay mounted and are only hidden: what the customer typed or uploaded
            must survive a visit to another tool. */}
      <div hidden={activeTool !== 'upload'}>
        <ImageTool onAddImage={handleAddImage} disabled={!canvasReady} />
      </div>
      <div hidden={activeTool !== 'text'}>
        <TextTool onAddText={handleAddText} disabled={!canvasReady} />
      </div>
      {product.options.length > 0 && (
        <div hidden={activeTool !== 'colors'}>
          <OptionPicker
            options={product.options}
            allEffects={views.flatMap((v) => v.effects)}
            selectedOptions={selectedOptions}
            onChange={handleOptionChange}
          />
        </div>
      )}

      <hr className="border-border" />

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleUndo}
          disabled={!canvasReady || !history.canUndo}
        >
          Undo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleRedo}
          disabled={!canvasReady || !history.canRedo}
        >
          Redo
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={handleDelete}
          disabled={!canvasReady || !selectedLayerId}
        >
          Delete
        </Button>
      </div>

      <LayerList
        layers={layerItems}
        selectedId={selectedLayerId}
        disabled={!canvasReady}
        onSelect={(id) => controlRef.current?.selectLayer(id)}
        onDelete={(id) => controlRef.current?.deleteLayer(id)}
        onMove={(id, direction) => controlRef.current?.moveLayer(id, direction)}
      />

      <hr className="border-border" />

      <SavePanel
        designId={designId}
        productId={product.id}
        designName={designName}
        isSaving={isSaving}
        onNameChange={setDesignName}
        onSave={() => handleSave(true)}
      />

      {/* Share (only after first save) */}
      {designId && <SharePanel designId={designId} />}
    </div>
  );

  // The canvas: the product photo (the template layers) sits behind the customer's layers.
  const canvasPane = (
    <div
      key="canvas"
      className="flex flex-1 flex-col items-center gap-3 overflow-x-auto bg-background p-4"
    >
      {activeView && (
        <WorkshopCanvas
          viewKey={activeViewKey}
          printArea={activeView.printArea}
          templateLayers={activeView.templateLayers}
          activeEffects={activeViewEffects}
          fabricJson={designData.views[activeViewKey]?.fabricJson ?? null}
          onLayersChange={(json) => handleLayersChange(activeViewKey, json)}
          onSelectionChange={setSelectedLayerId}
          onHistoryChange={setHistory}
          onReadyChange={setCanvasReady}
          controlRef={controlRef}
        />
      )}
      {selectedLowResolution && (
        <p role="status" className="mt-3 text-sm text-warning">
          This image may print blurry. Make it smaller or upload a larger image.
        </p>
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/dashboard/design"
          aria-label="Back to Design Workshop"
          className="rounded-full px-2 text-2xl leading-none text-foreground hover:bg-muted"
        >
          ‹
        </Link>
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Design Workshop</h1>
          <p className="text-xs text-muted-foreground">
            {designId ? 'Edit Design' : 'New Design'} · {product.name}
          </p>
        </div>
        {saveError && <p className="ml-auto text-xs font-medium text-destructive">{saveError}</p>}
      </div>

      {/* One card: tool rail, open tool, canvas (Figma) */}
      <div className="flex flex-col overflow-hidden rounded-3xl border border-border bg-card shadow-sm md:flex-row">
        <WorkshopToolRail tools={tools} activeTool={activeTool} onSelectTool={setActiveTool}>
          <ViewTabs
            views={designableViews}
            activeViewKey={activeViewKey}
            designData={designData}
            onViewChange={handleViewChange}
          />
        </WorkshopToolRail>

        {/* Keyboard order follows the screen: tool panel then canvas from a tablet up,
            canvas then tool panel on a phone. */}
        {isMdUp ? [toolPanel, canvasPane] : [canvasPane, toolPanel]}
      </div>
    </div>
  );
}
