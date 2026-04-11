'use client';

import { cn } from '@tamiym/ui';
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
    <div className="flex gap-1 border-b border-zinc-200 bg-white px-4">
      {designableViews.map((view) => {
        const viewData = designData.views[view.key];
        const hasLayers = viewData
          ? (viewData.fabricJson?.objects?.length ?? 0) > 0
          : false;
        const isActive = view.key === activeViewKey;

        return (
          <button
            key={view.key}
            type="button"
            onClick={() => onViewChange(view.key)}
            className={cn(
              'relative flex items-center gap-1.5 border-b-2 px-4 py-3 text-sm font-medium transition-colors',
              isActive
                ? 'border-zinc-900 text-zinc-900'
                : 'border-transparent text-zinc-500 hover:text-zinc-700',
            )}
          >
            {view.displayName}
            {hasLayers && (
              <span
                className={cn(
                  'h-2 w-2 rounded-full',
                  isActive ? 'bg-zinc-900' : 'bg-zinc-400',
                )}
                aria-label="has layers"
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
