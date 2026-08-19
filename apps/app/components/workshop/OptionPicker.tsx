'use client';

import { cn } from '@tamiym/ui';
import type { ProductOption, TemplateEffect } from '@/lib/designs';

interface OptionPickerProps {
  options: ProductOption[];
  allEffects: TemplateEffect[];
  selectedOptions: Record<string, string>; // optionId → optionValueId
  onChange: (optionId: string, optionValueId: string, activeEffects: TemplateEffect[]) => void;
}

/**
 * Renders product options (colour swatches, size dropdowns) and notifies the
 * parent of the active `TemplateEffect[]` whenever a selection changes.
 */
export default function OptionPicker({
  options,
  allEffects,
  selectedOptions,
  onChange,
}: OptionPickerProps) {
  if (options.length === 0) return null;

  const resolveEffects = (newSelections: Record<string, string>): TemplateEffect[] => {
    const selectedValueIds = new Set(Object.values(newSelections));
    return allEffects.filter((e) => selectedValueIds.has(e.optionValueId));
  };

  const handleSelect = (optionId: string, valueId: string) => {
    const newSelections = { ...selectedOptions, [optionId]: valueId };
    onChange(optionId, valueId, resolveEffects(newSelections));
  };

  return (
    <div className="flex flex-col gap-4">
      {options.map((option) => {
        const isColorOption =
          option.name.toLowerCase().includes('color') ||
          option.name.toLowerCase().includes('colour');

        return (
          <div key={option.id} className="flex flex-col gap-1.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
              {option.name}
            </span>

            {isColorOption ? (
              <div className="flex flex-wrap gap-2">
                {option.values.map((value) => {
                  const hex =
                    value.metadata &&
                    typeof value.metadata === 'object' &&
                    'hex' in (value.metadata as object)
                      ? String((value.metadata as { hex: string }).hex)
                      : null;
                  const isSelected = selectedOptions[option.id] === value.id;

                  return (
                    <button
                      key={value.id}
                      type="button"
                      title={value.displayName}
                      onClick={() => handleSelect(option.id, value.id)}
                      className={cn(
                        'h-8 w-8 rounded-full border-2 transition-all',
                        isSelected
                          ? 'border-zinc-900 ring-2 ring-zinc-900 ring-offset-1'
                          : 'border-white shadow'
                      )}
                      style={hex ? { backgroundColor: hex } : { backgroundColor: '#e5e7eb' }}
                      aria-pressed={isSelected}
                    />
                  );
                })}
              </div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {option.values.map((value) => {
                  const isSelected = selectedOptions[option.id] === value.id;
                  return (
                    <button
                      key={value.id}
                      type="button"
                      onClick={() => handleSelect(option.id, value.id)}
                      className={cn(
                        'rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors',
                        isSelected
                          ? 'border-zinc-900 bg-zinc-900 text-white'
                          : 'border-zinc-200 bg-white text-zinc-700 hover:border-zinc-400'
                      )}
                      aria-pressed={isSelected}
                    >
                      {value.displayName}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
