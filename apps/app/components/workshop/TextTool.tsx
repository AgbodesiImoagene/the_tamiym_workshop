'use client';

import { useRef, useState, useCallback } from 'react';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@tamiym/ui';

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

const ALIGN_ICONS: Record<'left' | 'center' | 'right', string> = {
  left: '⬛ L',
  center: '⬛ C',
  right: '⬛ R',
};

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
        <Select value={fontFamily} onValueChange={setFontFamily}>
          <SelectTrigger className="rounded-lg text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_FAMILIES.map((f) => (
              <SelectItem key={f} value={f}>
                {f}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={String(fontSize)} onValueChange={(val) => setFontSize(Number(val))}>
          <SelectTrigger className="rounded-lg text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FONT_SIZES.map((s) => (
              <SelectItem key={s} value={String(s)}>
                {s}px
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setBold((v) => !v)}
              className={`rounded px-2 py-1 text-sm font-bold ${bold ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'}`}
              aria-pressed={bold}
            >
              B
            </button>
          </TooltipTrigger>
          <TooltipContent>Bold</TooltipContent>
        </Tooltip>

        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => setItalic((v) => !v)}
              className={`rounded px-2 py-1 text-sm italic ${italic ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'}`}
              aria-pressed={italic}
            >
              I
            </button>
          </TooltipTrigger>
          <TooltipContent>Italic</TooltipContent>
        </Tooltip>

        {(['left', 'center', 'right'] as const).map((align) => (
          <Tooltip key={align}>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setTextAlign(align)}
                className={`rounded px-2 py-1 text-xs ${textAlign === align ? 'bg-zinc-900 text-white' : 'bg-zinc-100 text-zinc-700'}`}
                aria-pressed={textAlign === align}
              >
                {ALIGN_ICONS[align]}
              </button>
            </TooltipTrigger>
            <TooltipContent>Align {align}</TooltipContent>
          </Tooltip>
        ))}

        <Tooltip>
          <TooltipTrigger asChild>
            <label className="flex cursor-pointer items-center gap-1 text-xs text-zinc-600">
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
          </TooltipTrigger>
          <TooltipContent>Text colour</TooltipContent>
        </Tooltip>
      </div>

      <Button variant="secondary" size="sm" onClick={handleAdd} disabled={!text.trim()}>
        Add to canvas
      </Button>
    </div>
  );
}
