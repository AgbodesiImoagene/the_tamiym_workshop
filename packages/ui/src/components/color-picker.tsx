'use client';

import * as React from 'react';
import { ChevronDownIcon } from 'lucide-react';

import { cn } from '../lib/utils';
import { findColorByHex, searchColors, type NamedColor } from '../lib/colors';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Popover, PopoverContent, PopoverTrigger } from './ui/popover';

export interface ColorPickerProps {
  /** Names the control for screen readers, for example "Color of Navy". */
  label: string;
  /** Stored hex code. One that is not in the list is shown as it is. */
  value: string | null;
  onChange: (color: NamedColor) => void;
  disabled?: boolean;
  className?: string;
}

function Swatch({ hex }: { hex: string | null }) {
  return (
    <span
      aria-hidden="true"
      className="size-4 shrink-0 rounded-sm border border-border"
      style={hex ? { backgroundColor: hex } : undefined}
    />
  );
}

/** TTW-266: a colour chosen by typing its name. */
export function ColorPicker({ label, value, onChange, disabled, className }: ColorPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [activeIndex, setActiveIndex] = React.useState(0);
  const listId = React.useId();
  const listRef = React.useRef<HTMLUListElement>(null);

  const results = searchColors(query);
  const current = value ? findColorByHex(value) : undefined;
  const summary = value ? `${current?.name ?? 'Custom'} ${value}` : 'Choose a color';
  const optionId = (index: number) => `${listId}-${index}`;
  // A stable ref: the current colour is scrolled into view only when it appears.
  const showCurrent = React.useCallback((node: HTMLLIElement | null) => {
    node?.scrollIntoView?.({ block: 'nearest' });
  }, []);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setQuery('');
      // Start on the current colour, and on none for a custom one, so that Enter never
      // replaces a stored colour by another one.
      if (!value) setActiveIndex(0);
      else setActiveIndex(current ? searchColors('').indexOf(current) : -1);
    }
  };

  const choose = (color: NamedColor) => {
    onChange(color);
    setOpen(false);
  };

  const moveTo = (index: number) => {
    const next = Math.min(Math.max(index, 0), results.length - 1);
    if (next < 0) return;
    setActiveIndex(next);
    document.getElementById(optionId(next))?.scrollIntoView?.({ block: 'nearest' });
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      moveTo(activeIndex + 1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      moveTo(activeIndex - 1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const color = results[activeIndex];
      if (color) choose(color);
    }
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={cn('h-9 min-w-44 justify-start gap-2 font-normal', className)}
          aria-label={`${label}: ${summary}`}
          disabled={disabled}
        >
          <Swatch hex={value} />
          <span className="truncate">{summary}</span>
          <ChevronDownIcon aria-hidden="true" className="ml-auto size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2" aria-label={label}>
        <Input
          role="combobox"
          aria-label="Search colors"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={results[activeIndex] ? optionId(activeIndex) : undefined}
          autoComplete="off"
          className="h-9"
          placeholder="Type a color name"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
            if (listRef.current) listRef.current.scrollTop = 0;
          }}
          onKeyDown={handleKeyDown}
        />
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Colors"
          className="mt-2 max-h-60 overflow-auto"
        >
          {results.map((color, index) => (
            <li
              key={color.name}
              ref={color === current && index === activeIndex ? showCurrent : undefined}
              id={optionId(index)}
              role="option"
              aria-selected={index === activeIndex}
              aria-current={color === current || undefined}
              className={cn(
                'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                index === activeIndex && 'bg-muted'
              )}
              onMouseMove={() => setActiveIndex(index)}
              onClick={() => choose(color)}
            >
              <Swatch hex={color.hex} />
              <span className={cn(color === current && 'font-semibold')}>{color.name}</span>{' '}
              <span className="ml-auto font-mono text-xs text-muted-foreground">{color.hex}</span>
            </li>
          ))}
        </ul>
        {results.length === 0 && (
          <p role="status" className="px-2 py-1.5 text-sm text-muted-foreground">
            No color found.
          </p>
        )}
      </PopoverContent>
    </Popover>
  );
}
