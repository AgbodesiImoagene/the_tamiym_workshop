'use client';

import { use, useCallback, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { AdminShell } from '@/components/admin-shell';
import {
  getAdminProductDetail,
  updateAdminTemplateLayer,
  deleteAdminTemplateLayer,
  createAdminTemplateLayer,
  uploadAdminProductImage,
  upsertAdminPrintArea,
  type ProductView,
  type TemplateLayerType,
  type BlendMode,
} from '@/lib/products';
import { Badge, Button, Card, CardContent, CardHeader, CardTitle } from '@tamiym/ui';
import { LayerCompositePreview } from '@/components/workshop/LayerCompositePreview';
import { PrintAreaEditor } from '@/components/workshop/PrintAreaEditor';
import { LayerCard, NewLayerCard } from '@/components/workshop/LayerCard';

// ─── View Tab ─────────────────────────────────────────────────────────────────

function ViewTab({
  view,
  active,
  onClick,
}: {
  view: ProductView;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        'rounded-xl px-4 py-2 text-sm font-medium transition-colors',
        active ? 'bg-primary text-white shadow-xs' : 'bg-white text-gray-600 hover:bg-gray-100',
      ].join(' ')}
    >
      {view.displayName}
      {view.templateLayers.length > 0 && (
        <span
          className={[
            'ml-2 rounded-full px-1.5 py-0.5 text-xs font-medium',
            active ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary',
          ].join(' ')}
        >
          {view.templateLayers.length}
        </span>
      )}
    </button>
  );
}

// ─── View Workshop Panel ──────────────────────────────────────────────────────

function ViewWorkshopPanel({
  view,
  productId,
  onRefresh,
}: {
  view: ProductView;
  productId: string;
  onRefresh: () => void;
}) {
  const printArea = view.printAreas[0] ?? null;
  const [savingPrintArea, setSavingPrintArea] = useState(false);
  const [printAreaSuccess, setPrintAreaSuccess] = useState(false);

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
                This view is not designable. Set <strong>isDesignable: true</strong> on the view to
                configure a print area.
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
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Key</span>
              <code className="font-mono text-foreground">{view.key}</code>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Designable</span>
              <Badge variant={view.isDesignable ? 'accent' : 'neutral'}>
                {view.isDesignable ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Default view</span>
              <Badge variant={view.isDefault ? 'brand' : 'neutral'}>
                {view.isDefault ? 'Yes' : 'No'}
              </Badge>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sort order</span>
              <span>{view.sortOrder}</span>
            </div>
          </CardContent>
        </Card>
      </div>
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
      ) : product.views.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <p className="text-sm text-muted-foreground">
              This product has no views configured. Create views via the API before setting up
              workshop layers.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* View tabs */}
          <div className="flex flex-wrap gap-2">
            {product.views.map((view) => (
              <ViewTab
                key={view.id}
                view={view}
                active={view.id === (activeView?.id ?? product.views[0]?.id)}
                onClick={() => setActiveViewId(view.id)}
              />
            ))}
          </div>

          {/* Active view panel */}
          {activeView && (
            <div className="mt-6">
              <ViewWorkshopPanel
                key={activeView.id}
                view={activeView}
                productId={productId}
                onRefresh={refresh}
              />
            </div>
          )}
        </>
      )}
    </AdminShell>
  );
}
