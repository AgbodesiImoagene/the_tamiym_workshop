'use client';

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { Button } from '@tamiym/ui';
import ViewTabs from './ViewTabs';
import TextTool from './TextTool';
import ImageTool from './ImageTool';
import OptionPicker from './OptionPicker';
import SavePanel from './SavePanel';
import SharePanel from './SharePanel';
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

  const handleAddText = useCallback((textObject: Record<string, unknown>) => {
    void controlRef.current?.addText(textObject);
  }, []);

  const handleAddImage = useCallback((imageObject: Record<string, unknown>) => {
    void controlRef.current?.addImage(imageObject);
  }, []);

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
        return [{ id: layerId, label: 'Image', kind: 'image' as const }];
      }
      return [{ id: layerId, label: 'Layer', kind: 'other' as const }];
    });
  }, [designData, activeViewKey]);

  return (
    <div className="flex h-full min-h-screen flex-col bg-zinc-50">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-3">
        <div>
          <h1 className="text-base font-semibold text-zinc-900">
            {designId ? 'Edit Design' : 'New Design'}
          </h1>
          <p className="text-xs text-zinc-500">{product.name}</p>
        </div>
        {saveError && <p className="text-xs font-medium text-red-600">{saveError}</p>}
      </div>

      {/* View tabs */}
      <ViewTabs
        views={designableViews}
        activeViewKey={activeViewKey}
        designData={designData}
        onViewChange={handleViewChange}
      />

      {/* Main editor area */}
      <div className="flex flex-1 gap-0">
        {/* Canvas */}
        <div className="flex flex-1 flex-col items-center gap-3 p-6">
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
        </div>

        {/* Right sidebar */}
        <div className="flex w-72 flex-col gap-4 overflow-y-auto border-l border-zinc-200 bg-white p-4">
          {/* Options */}
          {product.options.length > 0 && (
            <OptionPicker
              options={product.options}
              allEffects={views.flatMap((v) => v.effects)}
              selectedOptions={selectedOptions}
              onChange={handleOptionChange}
            />
          )}

          <hr className="border-zinc-100" />

          {/* Text tool */}
          <TextTool onAddText={handleAddText} disabled={!canvasReady} />

          {/* Image tool */}
          <ImageTool onAddImage={handleAddImage} disabled={!canvasReady} />

          {/* Layers */}
          <LayerList
            layers={layerItems}
            selectedId={selectedLayerId}
            disabled={!canvasReady}
            onSelect={(id) => controlRef.current?.selectLayer(id)}
            onDelete={(id) => controlRef.current?.deleteLayer(id)}
            onMove={(id, direction) => controlRef.current?.moveLayer(id, direction)}
          />

          <hr className="border-zinc-100" />

          {/* Save */}
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
      </div>
    </div>
  );
}
