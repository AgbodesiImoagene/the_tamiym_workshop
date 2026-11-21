'use client';

import { Tabs, TabsList, TabsTrigger, cn } from '@tamiym/ui';
import type { WorkshopView, DesignData } from '@/lib/designs';

interface ViewTabsProps {
  views: WorkshopView[];
  activeViewKey: string;
  designData: DesignData;
  onViewChange: (viewKey: string) => void;
}

/**
 * Renders a tab strip for each designable product view.
 * Displays a dot badge on views that have at least one user layer.
 */
export default function ViewTabs({
  views,
  activeViewKey,
  designData,
  onViewChange,
}: ViewTabsProps) {
  const designableViews = views.filter((v) => v.isDesignable);

  if (designableViews.length <= 1) return null;

  return (
    <Tabs value={activeViewKey} onValueChange={onViewChange}>
      <TabsList
        variant="line"
        className="h-auto w-full flex-row justify-start gap-2 rounded-none bg-transparent p-0 md:flex-col"
      >
        {designableViews.map((view) => {
          const viewData = designData.views[view.key];
          const hasLayers = viewData ? (viewData.fabricJson?.objects?.length ?? 0) > 0 : false;
          const photo = view.templateLayers.find((layer) => layer.imageUrl)?.imageUrl ?? null;

          return (
            <TabsTrigger
              key={view.key}
              value={view.key}
              className={cn(
                'h-auto w-20 flex-col gap-1 rounded-lg border border-transparent px-1 py-2 text-xs data-active:border-foreground data-active:bg-background data-active:shadow-none'
              )}
            >
              {photo ? (
                // eslint-disable-next-line @next/next/no-img-element -- a small preview of the product photo
                <img src={photo} alt="" className="h-12 w-12 rounded-md object-cover" />
              ) : (
                <span className="h-12 w-12 rounded-md bg-border" aria-hidden="true" />
              )}
              {view.displayName}
              {hasLayers && (
                <span
                  className="h-2 w-2 rounded-full bg-current opacity-60"
                  aria-label="has layers"
                />
              )}
            </TabsTrigger>
          );
        })}
      </TabsList>
    </Tabs>
  );
}
