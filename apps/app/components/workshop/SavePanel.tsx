'use client';

import { Button } from '@tamiym/ui';

interface SavePanelProps {
  designId?: string;
  designName: string;
  isSaving: boolean;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onCaptureThumbnail?: () => Promise<Blob | null>;
}

/**
 * Panel with a design name input and Save / Auto-save indicator.
 * The parent component owns saving state; this is a pure UI shell.
 */
export default function SavePanel({
  designName,
  isSaving,
  onNameChange,
  onSave,
}: SavePanelProps) {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-zinc-900">Save Design</h3>

      <div>
        <label htmlFor="design-name" className="mb-1 block text-xs text-zinc-500">
          Design name
        </label>
        <input
          id="design-name"
          type="text"
          value={designName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="My design"
          disabled={isSaving}
          className="flex h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-zinc-900 disabled:opacity-50"
        />
      </div>

      <Button
        variant="primary"
        size="sm"
        onClick={onSave}
        disabled={isSaving || !designName.trim()}
      >
        {isSaving ? 'Saving…' : 'Save'}
      </Button>

      {isSaving && (
        <p className="text-xs text-zinc-400">Auto-saving…</p>
      )}
    </div>
  );
}
