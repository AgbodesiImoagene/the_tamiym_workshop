'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import ViewTabs from './ViewTabs';
import TextTool from './TextTool';
import ImageTool from './ImageTool';
import OptionPicker from './OptionPicker';
import SavePanel from './SavePanel';
import SharePanel from './SharePanel';
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

  // Reference to the active canvas DOM element for thumbnail capture
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const canvasRef = useRef<any>(null);

  // Auto-save timer
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleAutoSave = useCallback(() => {
    if (!designId) return; // Only auto-save after first explicit save
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      handleSave(false);
    }, AUTOSAVE_DELAY_MS);
  }, [designId]); // eslint-disable-line react-hooks/exhaustive-deps

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
    if (!canvasRef.current) return null;
    try {
      const dataUrl: string = canvasRef.current.toDataURL({
        format: 'webp',
        quality: 0.8,
      });
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

  const handleAddText = useCallback((textObject: Record<string, unknown>) => {
    if (!canvasRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import('fabric').then((mod: any) => {
      const IText = mod.IText ?? mod.fabric?.IText;
      const itext = new IText(String(textObject.text ?? 'Text'), textObject);
      canvasRef.current.add(itext);
      canvasRef.current.setActiveObject(itext);
      canvasRef.current.requestRenderAll?.();
      canvasRef.current.renderAll?.();
    });
  }, []);

  const handleAddImage = useCallback((imageObject: Record<string, unknown>) => {
    if (!canvasRef.current) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    import('fabric').then(async (mod: any) => {
      const ImageCtor = mod.FabricImage ?? mod.Image ?? mod.fabric?.Image;
      const img = await ImageCtor.fromURL(String(imageObject.src ?? ''), {
        crossOrigin: 'anonymous',
      });
      img.set(imageObject);
      canvasRef.current.add(img);
      canvasRef.current.setActiveObject(img);
      canvasRef.current.requestRenderAll?.();
      canvasRef.current.renderAll?.();
    });
  }, []);

  const activeView = designableViews.find((v) => v.key === activeViewKey);

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
        onViewChange={setActiveViewKey}
      />

      {/* Main editor area */}
      <div className="flex flex-1 gap-0">
        {/* Canvas */}
        <div className="flex flex-1 items-start justify-center p-6">
          {activeView && (
            <WorkshopCanvas
              viewKey={activeViewKey}
              printArea={activeView.printArea}
              templateLayers={activeView.templateLayers}
              activeEffects={activeView.effects.filter((e) =>
                activeEffects.some((ae) => ae.id === e.id)
              )}
              fabricJson={designData.views[activeViewKey]?.fabricJson ?? null}
              onLayersChange={(json) => handleLayersChange(activeViewKey, json)}
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
          <TextTool onAddText={handleAddText} />

          {/* Image tool */}
          <ImageTool onAddImage={handleAddImage} />

          <hr className="border-zinc-100" />

          {/* Save */}
          <SavePanel
            designId={designId}
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
