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
        className="h-auto w-full justify-start rounded-none border-b border-zinc-200 bg-white px-4 pb-0"
      >
        {designableViews.map((view) => {
          const viewData = designData.views[view.key];
          const hasLayers = viewData ? (viewData.fabricJson?.objects?.length ?? 0) > 0 : false;

          return (
            <TabsTrigger
              key={view.key}
              value={view.key}
              className={cn(
                'rounded-none border-x-0 border-t-0 py-3 text-sm data-active:border-b-2 data-active:border-zinc-900 data-active:bg-transparent data-active:shadow-none'
              )}
            >
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
