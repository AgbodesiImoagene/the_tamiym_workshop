'use client';

import { use, useCallback, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AdminShell } from '@/components/admin-shell';
import { ProductMerchandisingPanels } from '@/components/admin-product-merchandising';
import { ProductSettingsPanel } from '@/components/admin-product-settings-panels';
import {
  getAdminProductDetail,
  updateAdminTemplateLayer,
  deleteAdminTemplateLayer,
  createAdminTemplateLayer,
  uploadAdminProductImage,
  upsertAdminPrintArea,
  updateAdminProductView,
  deleteAdminProductView,
  type ProductImage,
  type ProductOption,
  type ProductView,
  type TemplateLayerType,
  type BlendMode,
} from '@/lib/products';
import type { ApiError } from '@/lib/api';
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  ConfirmDialog,
  Input,
  Label,
  Tabs,
  TabsList,
  TabsTrigger,
} from '@tamiym/ui';
import { LayerCompositePreview } from '@/components/workshop/LayerCompositePreview';
import { PrintAreaEditor } from '@/components/workshop/PrintAreaEditor';
import { LayerCard, NewLayerCard } from '@/components/workshop/LayerCard';
import { TemplateEffectsPanel } from '@/components/workshop/TemplateEffectsPanel';
import { CreateProductViewForm } from '@/components/workshop/CreateProductViewForm';

// ─── View Tab ─────────────────────────────────────────────────────────────────

// ─── View Workshop Panel ──────────────────────────────────────────────────────

function ViewWorkshopPanel({
  view,
  productId,
  options,
  images,
  viewCount,
  onRefresh,
  onViewDeleted,
}: {
  view: ProductView;
  productId: string;
  options: ProductOption[];
  images: ProductImage[];
  viewCount: number;
  onRefresh: () => void;
  onViewDeleted: () => void;
}) {
  const printArea = view.printAreas[0] ?? null;
  const [savingPrintArea, setSavingPrintArea] = useState(false);
  const [printAreaSuccess, setPrintAreaSuccess] = useState(false);

  const [viewKey, setViewKey] = useState(view.key);
  const [viewDisplayName, setViewDisplayName] = useState(view.displayName);
  const [viewSortOrder, setViewSortOrder] = useState(String(view.sortOrder));
  const [viewDesignable, setViewDesignable] = useState(view.isDesignable);
  const [viewDefault, setViewDefault] = useState(view.isDefault);
  const [confirmDeleteView, setConfirmDeleteView] = useState(false);

  useEffect(() => {
    setViewKey(view.key);
    setViewDisplayName(view.displayName);
    setViewSortOrder(String(view.sortOrder));
    setViewDesignable(view.isDesignable);
    setViewDefault(view.isDefault);
  }, [view.id, view.key, view.displayName, view.sortOrder, view.isDesignable, view.isDefault]);

  const saveViewMut = useMutation({
    mutationFn: () => {
      const sort = parseInt(viewSortOrder, 10);
      if (viewSortOrder.trim() !== '' && Number.isNaN(sort)) {
        throw new Error('Sort order must be a number.');
      }
      const normalizedKey = viewKey.trim().toLowerCase().replace(/\s+/g, '_');
      if (!normalizedKey) {
        throw new Error('View key is required.');
      }
      return updateAdminProductView(productId, view.id, {
        ...(normalizedKey !== view.key ? { key: normalizedKey } : {}),
        displayName: viewDisplayName.trim() || view.displayName,
        ...(viewSortOrder.trim() !== '' && !Number.isNaN(sort) ? { sortOrder: sort } : {}),
        isDesignable: viewDesignable,
        isDefault: viewDefault,
      });
    },
    onSuccess: () => onRefresh(),
    onError: (e: unknown) => {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as ApiError).message)
          : 'Could not save view';
      alert(msg);
    },
  });

  const deleteViewMut = useMutation({
    mutationFn: () => deleteAdminProductView(productId, view.id),
    onSuccess: () => onViewDeleted(),
    onError: (e: unknown) => {
      const msg =
        e && typeof e === 'object' && 'message' in e
          ? String((e as ApiError).message)
          : 'Could not delete view';
      alert(msg);
    },
  });

  const baseLayer = view.templateLayers.find((l) => l.layerType === 'BASE');
  const baseImageUrl =
    baseLayer?.imageUrl ??
    baseLayer?.image?.mediaAsset?.derivatives?.[0]?.url ??
    baseLayer?.image?.mediaAsset?.originalUrl ??
    null;

  const handleUpdateLayer = useCallback(
    async (
      layerId: string,
      dto: {
        blendMode?: BlendMode;
        opacity?: number;
        zIndex?: number;
        displayName?: string;
      }
    ) => {
      await updateAdminTemplateLayer(productId, view.id, layerId, dto);
      onRefresh();
    },
    [productId, view.id, onRefresh]
  );

  const handleDeleteLayer = useCallback(
    async (layerId: string) => {
      await deleteAdminTemplateLayer(productId, view.id, layerId);
      onRefresh();
    },
    [productId, view.id, onRefresh]
  );

  const handleNewLayer = useCallback(
    async (
      file: File,
      dto: {
        key: string;
        displayName?: string;
        layerType: TemplateLayerType;
        blendMode: BlendMode;
        opacity: number;
        zIndex: number;
      }
    ) => {
      const productImage = await uploadAdminProductImage(productId, file, {
        altText: dto.displayName ?? dto.key,
        sortOrder: dto.zIndex,
      });
      await createAdminTemplateLayer(productId, view.id, {
        ...dto,
        imageId: productImage.id,
      });
      onRefresh();
    },
    [productId, view.id, onRefresh]
  );

  const handleSavePrintArea = useCallback(
    async (area: {
      x: number;
      y: number;
      width: number;
      height: number;
      rotationAllowed?: boolean;
      maxLayers?: number;
      maxColors?: number;
    }) => {
      setSavingPrintArea(true);
      setPrintAreaSuccess(false);
      try {
        await upsertAdminPrintArea(productId, view.id, area);
        setPrintAreaSuccess(true);
        onRefresh();
        setTimeout(() => setPrintAreaSuccess(false), 3000);
      } finally {
        setSavingPrintArea(false);
      }
    },
    [productId, view.id, onRefresh]
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-[1fr_380px]">
        {/* Left: preview + layers */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Live composite preview</CardTitle>
            </CardHeader>
            <CardContent>
              <LayerCompositePreview
                layers={view.templateLayers}
                printArea={printArea}
                height={360}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>
                Template layers{' '}
                <span className="text-sm font-normal text-muted-foreground">sorted by z-index</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {view.templateLayers.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No layers yet. Upload your first layer below.
                </p>
              )}
              {view.templateLayers.map((layer) => (
                <LayerCard
                  key={layer.id}
                  layer={layer}
                  productId={productId}
                  viewId={view.id}
                  onUpdate={handleUpdateLayer}
                  onDelete={handleDeleteLayer}
                />
              ))}
              <NewLayerCard
                productId={productId}
                viewId={view.id}
                existingCount={view.templateLayers.length}
                onUpload={handleNewLayer}
              />
            </CardContent>
          </Card>
        </div>

        {/* Right: print area + view info */}
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Print area</CardTitle>
                {printAreaSuccess && (
                  <span className="text-xs font-medium text-green-600">Saved ✓</span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {!view.isDesignable ? (
                <p className="text-sm text-muted-foreground">
                  This view is not designable. Turn on &quot;Designable&quot; in View settings
                  below, save, then configure the print area.
                </p>
              ) : (
                <PrintAreaEditor
                  baseImageUrl={baseImageUrl}
                  printArea={printArea}
                  onSave={handleSavePrintArea}
                  isSaving={savingPrintArea}
                />
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>View settings</CardTitle>
              <CardDescription>
                Display name, ordering, and whether this view is the default workshop target.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <div className="space-y-1">
                <Label className="text-xs">View key</Label>
                <Input
                  className="h-9 font-mono text-sm"
                  value={viewKey}
                  onChange={(e) => setViewKey(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  Unique per product; saved as lowercase with underscores.
                </p>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Display name</Label>
                <Input
                  className="h-9"
                  value={viewDisplayName}
                  onChange={(e) => setViewDisplayName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Sort order</Label>
                <Input
                  className="h-9 w-24"
                  inputMode="numeric"
                  value={viewSortOrder}
                  onChange={(e) => setViewSortOrder(e.target.value)}
                />
              </div>
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={viewDesignable}
                  onCheckedChange={(checked) => setViewDesignable(checked as boolean)}
                />
                <span>Designable (workshop / print area)</span>
              </label>
              <label className="flex cursor-pointer items-center gap-2">
                <Checkbox
                  checked={viewDefault}
                  onCheckedChange={(checked) => setViewDefault(checked as boolean)}
                />
                <span>Default view</span>
              </label>
              <Button
                type="button"
                size="sm"
                disabled={saveViewMut.isPending}
                onClick={() => saveViewMut.mutate()}
              >
                {saveViewMut.isPending ? 'Saving…' : 'Save view settings'}
              </Button>
              <div className="border-t border-border pt-4">
                <p className="mb-2 text-xs font-medium text-red-700">Danger zone</p>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="text-red-700 hover:bg-red-50 hover:text-red-800"
                  disabled={deleteViewMut.isPending}
                  onClick={() => setConfirmDeleteView(true)}
                >
                  {deleteViewMut.isPending ? 'Deleting…' : 'Delete this view'}
                </Button>
                <ConfirmDialog
                  open={confirmDeleteView}
                  onOpenChange={setConfirmDeleteView}
                  title="Delete this view?"
                  description={
                    viewCount <= 1
                      ? 'This is the only view — the workshop section will be empty until you add views again. Layers, print area, and effects will be removed.'
                      : 'Its template layers, print area, and effects will be removed.'
                  }
                  confirmLabel="Delete"
                  destructive
                  onConfirm={() => deleteViewMut.mutate()}
                />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <TemplateEffectsPanel
        productId={productId}
        view={view}
        options={options}
        images={images}
        onRefresh={onRefresh}
      />
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AdminCatalogProductDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: productId } = use(params);
  const queryClient = useQueryClient();
  const [activeViewId, setActiveViewId] = useState<string | null>(null);

  const {
    data: product,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['admin-product-detail', productId],
    queryFn: () => getAdminProductDetail(productId),
  });

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({
      queryKey: ['admin-product-detail', productId],
    });
  }, [queryClient, productId]);

  const handleViewCreated = useCallback(
    (viewId: string) => {
      refresh();
      setActiveViewId(viewId);
    },
    [refresh]
  );

  const handleViewsBulkCreated = useCallback(() => {
    refresh();
    setActiveViewId(null);
  }, [refresh]);

  const handleViewDeleted = useCallback(() => {
    setActiveViewId(null);
    refresh();
  }, [refresh]);

  const STATUS_BADGE: Record<
    string,
    { variant: 'brand' | 'accent' | 'neutral' | 'danger'; label: string }
  > = {
    ACTIVE: { variant: 'accent', label: 'Active' },
    DRAFT: { variant: 'neutral', label: 'Draft' },
    ARCHIVED: { variant: 'danger', label: 'Archived' },
  };

  const badge = product
    ? (STATUS_BADGE[product.status] ?? { variant: 'neutral' as const, label: product.status })
    : null;

  const activeView: ProductView | undefined =
    product?.views.find((v) => v.id === activeViewId) ?? product?.views[0];

  const pageTitle = isLoading
    ? 'Loading…'
    : isError
      ? 'Product not found'
      : (product?.name ?? 'Product');

  return (
    <AdminShell
      activeNav="catalog"
      title={pageTitle}
      description={
        product?.description ??
        'Upload template layers and define the print area for each product view.'
      }
      actions={
        <div className="flex items-center gap-3">
          {badge && <Badge variant={badge.variant}>{badge.label}</Badge>}
          <Link href="/admin/catalog/products">
            <Button variant="ghost" size="sm">
              ← Products
            </Button>
          </Link>
        </div>
      }
    >
      {isLoading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">Loading product…</p>
      ) : isError || !product ? (
        <div className="py-16 text-center">
          <p className="text-sm text-red-600">Failed to load product.</p>
        </div>
      ) : (
        <div className="space-y-8">
          <ProductSettingsPanel product={product} onUpdated={refresh} />
          <ProductMerchandisingPanels product={product} onChanged={refresh} />

          {product.views.length === 0 ? (
            <CreateProductViewForm
              productId={productId}
              views={product.views}
              variant="empty"
              onCreated={handleViewCreated}
              onBulkCreated={handleViewsBulkCreated}
            />
          ) : (
            <>
              <Tabs
                value={activeView?.id ?? product.views[0]?.id ?? ''}
                onValueChange={(id) => setActiveViewId(id)}
              >
                <TabsList className="h-auto flex-wrap gap-1 bg-transparent p-0">
                  {product.views.map((view) => (
                    <TabsTrigger
                      key={view.id}
                      value={view.id}
                      className="h-auto rounded-xl px-4 py-2 text-sm font-medium data-active:bg-primary data-active:text-white data-active:shadow-xs"
                    >
                      {view.displayName}
                      {view.templateLayers.length > 0 && (
                        <span className="ml-1 rounded-full px-1.5 py-0.5 text-xs font-medium">
                          {view.templateLayers.length}
                        </span>
                      )}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              {activeView && (
                <div className="mt-2">
                  <ViewWorkshopPanel
                    key={activeView.id}
                    view={activeView}
                    productId={productId}
                    options={product.options}
                    images={product.images}
                    viewCount={product.views.length}
                    onRefresh={refresh}
                    onViewDeleted={handleViewDeleted}
                  />
                </div>
              )}

              <div className="mt-6">
                <CreateProductViewForm
                  productId={productId}
                  views={product.views}
                  variant="inline"
                  onCreated={handleViewCreated}
                  onBulkCreated={handleViewsBulkCreated}
                />
              </div>
            </>
          )}
        </div>
      )}
    </AdminShell>
  );
}
