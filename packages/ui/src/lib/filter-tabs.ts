/**
 * Shared pill-style filter tabs (admin queues, catalog views, moderation filters).
 * Uses muted track + foreground text on the active pill — avoids white-on-white when
 * custom color utilities are missing from the CSS bundle.
 */
export const filterTabsListClassName =
  'h-auto flex-wrap gap-1 rounded-xl bg-muted p-1 text-muted-foreground';

export const filterTabsTriggerClassName =
  'h-auto rounded-lg px-4 py-2 text-sm font-medium shadow-none data-active:shadow-xs';
