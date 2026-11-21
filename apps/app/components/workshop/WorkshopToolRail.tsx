'use client';

import type { ReactNode } from 'react';
import { cn } from '@tamiym/ui';

export type WorkshopTool = 'upload' | 'text' | 'colors';

const TOOL_LABELS: Record<WorkshopTool, string> = {
  upload: 'Upload',
  text: 'Add Text',
  colors: 'Product Colors',
};

interface WorkshopToolRailProps {
  /** The tools to offer, in order. */
  tools: WorkshopTool[];
  activeTool: WorkshopTool;
  onSelectTool: (tool: WorkshopTool) => void;
  /** The view thumbnails, shown under the tools. */
  children?: ReactNode;
}

/**
 * The narrow left rail of the Design Workshop (TTW-105): the tool buttons, then the thumbnails
 * of the product views. It only switches which tool is open; each tool keeps its behaviour.
 */
export default function WorkshopToolRail({
  tools,
  activeTool,
  onSelectTool,
  children,
}: WorkshopToolRailProps) {
  return (
    <div
      role="toolbar"
      aria-label="Workshop tools"
      aria-orientation="vertical"
      className="flex shrink-0 flex-row gap-2 overflow-x-auto border-b border-border bg-muted p-2 md:w-24 md:flex-col md:overflow-visible md:border-b-0 md:border-r"
    >
      {tools.map((tool) => (
        <button
          key={tool}
          type="button"
          aria-pressed={activeTool === tool}
          onClick={() => onSelectTool(tool)}
          className={cn(
            'rounded-lg px-2 py-3 text-xs font-medium text-foreground transition-colors hover:bg-background',
            activeTool === tool && 'bg-background shadow-sm'
          )}
        >
          {TOOL_LABELS[tool]}
        </button>
      ))}
      {children}
    </div>
  );
}
