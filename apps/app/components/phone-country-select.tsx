'use client';

import { phoneCountryOptions, searchPhoneCountries, type PhoneCountryOption } from '@/lib/phone';
import { Popover, PopoverContent, PopoverTrigger, cn } from '@tamiym/ui';
import { useEffect, useId, useMemo, useRef, useState } from 'react';

interface PhoneCountrySelectProps {
  /** ISO country code, for example "NG". */
  value: string;
  onChange: (code: string) => void;
  className?: string;
}

const label = (option: PhoneCountryOption) => `${option.name} (+${option.callingCode})`;

/**
 * Country selector for the phone field (TTW-264). The button shows the chosen country and
 * its calling code; the dropdown has a search field on top (by code or by name) and the
 * countries in alphabetical order below.
 */
export function PhoneCountrySelect({ value, onChange, className }: PhoneCountrySelectProps) {
  const options = phoneCountryOptions();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Set by the arrow keys and the mouse; until then the highlight follows the search.
  const [moved, setMoved] = useState<number | null>(null);
  const listId = useId();
  const listRef = useRef<HTMLUListElement>(null);

  const matches = useMemo(() => searchPhoneCountries(options, query), [options, query]);
  const selected = options.find((option) => option.code === value);

  // The list opens on the chosen country; a search puts the highlight on its first result.
  const selectedIndex = matches.findIndex((option) => option.code === value);
  const defaultIndex = query.trim() ? 0 : Math.max(0, selectedIndex);
  const active = Math.min(moved ?? defaultIndex, Math.max(0, matches.length - 1));

  // Keep the highlighted country in view while moving with the keyboard.
  useEffect(() => {
    if (!open) return;
    const row = listRef.current?.querySelector<HTMLElement>('[data-active="true"]');
    row?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active, matches]);

  function choose(option: PhoneCountryOption) {
    onChange(option.code);
    setOpen(false);
  }

  function onSearchKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setMoved(Math.min(active + 1, matches.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setMoved(Math.max(active - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = matches[active];
      if (option) choose(option);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        setMoved(null);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-label="Country calling code"
          aria-haspopup="listbox"
          aria-controls={listId}
          aria-expanded={open}
          className={cn(
            'flex h-8 items-center justify-between gap-1 rounded-lg border border-input bg-transparent px-2.5 text-left text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm',
            className
          )}
        >
          <span className="truncate">{selected ? label(selected) : 'Country'}</span>
          <svg
            viewBox="0 0 24 24"
            className="size-4 shrink-0 opacity-60"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            aria-hidden="true"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(320px,90vw)] p-0" align="start">
        <div className="border-b border-border p-2">
          <input
            type="search"
            aria-label="Search country code"
            placeholder="Search by code or name, e.g. +44"
            autoComplete="off"
            // The list opens to be searched: the focus goes straight to the field.
            autoFocus
            maxLength={30}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setMoved(null);
            }}
            onKeyDown={onSearchKeyDown}
            className="h-8 w-full rounded-md border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Countries"
          className="max-h-64 overflow-y-auto p-1"
        >
          {matches.map((option, index) => (
            <li
              key={option.code}
              role="option"
              aria-selected={option.code === value}
              data-code={option.code}
              data-active={index === active}
              onMouseEnter={() => setMoved(index)}
              onClick={() => choose(option)}
              className={cn(
                'flex cursor-pointer items-center justify-between gap-2 rounded-md px-2 py-1.5 text-sm',
                index === active && 'bg-muted'
              )}
            >
              <span className="truncate">{label(option)}</span>
              {option.code === value ? (
                <svg
                  viewBox="0 0 24 24"
                  className="size-4 shrink-0"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  aria-hidden="true"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : null}
            </li>
          ))}
        </ul>
        {matches.length === 0 ? (
          <p className="px-3 py-4 text-center text-sm text-black/60">No country matches.</p>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
