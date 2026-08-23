'use client';

import { Button, Label, cn } from '@tamiym/ui';
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
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {option.name}
            </Label>

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
                          ? 'border-foreground ring-2 ring-foreground ring-offset-1'
                          : 'border-background shadow'
                      )}
                      style={
                        hex ? { backgroundColor: hex } : { backgroundColor: 'var(--color-muted)' }
                      }
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
                    <Button
                      key={value.id}
                      type="button"
                      size="sm"
                      variant={isSelected ? 'secondary' : 'outline'}
                      onClick={() => handleSelect(option.id, value.id)}
                      className="text-xs"
                      aria-pressed={isSelected}
                    >
                      {value.displayName}
                    </Button>
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
