'use client';

import { useRef, useState, useCallback } from 'react';
import { Button } from '@tamiym/ui';

const FONT_FAMILIES = [
  'Arial',
  'Georgia',
  'Helvetica',
  'Impact',
  'Montserrat',
  'Oswald',
  'Playfair Display',
  'Roboto',
  'Times New Roman',
  'Trebuchet MS',
];

const FONT_SIZES = [12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 64, 72, 96];

interface TextToolProps {
  /** Called with a fabric.IText-compatible JSON to add to the canvas */
  onAddText: (textObject: Record<string, unknown>) => void;
}

/**
 * Toolbar for adding styled IText objects to the canvas.
 * Calls `onAddText` with a Fabric.js-compatible text object definition.
 */
export default function TextTool({ onAddText }: TextToolProps) {
  const [text, setText] = useState('Your text here');
  const [fontFamily, setFontFamily] = useState('Arial');
  const [fontSize, setFontSize] = useState(24);
  const [bold, setBold] = useState(false);
  const [italic, setItalic] = useState(false);
  const [fill, setFill] = useState('#000000');
  const [textAlign, setTextAlign] = useState<'left' | 'center' | 'right'>('left');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleAdd = useCallback(() => {
    onAddText({
      type: 'i-text',
      text,
      fontFamily,
      fontSize,
      fontWeight: bold ? 'bold' : 'normal',
      fontStyle: italic ? 'italic' : 'normal',
      fill,
      textAlign,
      left: 50,
      top: 50,
      selectable: true,
      editable: true,
    });
    setText('Your text here');
    inputRef.current?.focus();
  }, [text, fontFamily, fontSize, bold, italic, fill, textAlign, onAddText]);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-zinc-200 bg-white p-4">
      <h3 className="text-sm font-semibold text-zinc-900">Add Text</h3>

      <input
        ref={inputRef}
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Enter text…"
        className="w-full rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm outline-none focus:border-zinc-400"
      />

      <div className="grid grid-cols-2 gap-2">
        {/* Font family */}
        <select
          value={fontFamily}
          onChange={(e) => setFontFamily(e.target.value)}
          className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs outline-none"
        >
          {FONT_FAMILIES.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>

        {/* Font size */}
        <select
          value={fontSize}
          onChange={(e) => setFontSize(Number(e.target.value))}
          className="rounded-lg border border-zinc-200 bg-zinc-50 px-2 py-1.5 text-xs outline-none"
        >
          {FONT_SIZES.map((s) => (
            <option key={s} value={s}>
              {s}px
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2">
        {/* Bold */}
        <button
          type="button"
          onClick={() => setBold((v) => !v)}
          className={`rounded px-2 py-1 text-sm font-bold ${bold ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'}`}
          aria-pressed={bold}
          title="Bold"
        >
          B
        </button>

        {/* Italic */}
        <button
          type="button"
          onClick={() => setItalic((v) => !v)}
          className={`rounded px-2 py-1 text-sm italic ${italic ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'}`}
          aria-pressed={italic}
          title="Italic"
        >
          I
        </button>

        {/* Align */}
        {(['left', 'center', 'right'] as const).map((align) => (
          <button
            key={align}
            type="button"
            onClick={() => setTextAlign(align)}
            className={`rounded px-2 py-1 text-xs ${textAlign === align ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'}`}
            aria-pressed={textAlign === align}
            title={`Align ${align}`}
          >
            {align === 'left' ? '≡' : align === 'center' ? '≡' : '≡'}
          </button>
        ))}

        {/* Colour picker */}
        <label className="flex items-center gap-1 text-xs text-zinc-600" title="Text colour">
          <span
            className="h-5 w-5 rounded border border-zinc-300"
            style={{ backgroundColor: fill }}
          />
          <input
            type="color"
            value={fill}
            onChange={(e) => setFill(e.target.value)}
            className="sr-only"
          />
          Colour
        </label>
      </div>

      <Button variant="secondary" size="sm" onClick={handleAdd} disabled={!text.trim()}>
        Add to canvas
      </Button>
    </div>
  );
}
