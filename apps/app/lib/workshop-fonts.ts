/**
 * TTW-103: the fonts the Design Workshop offers.
 *
 * Every offered font is shipped with the app (an @fontsource package, so no request to a
 * third-party CDN and no dependency on what the visitor has installed). A font that depends
 * on the visitor's machine would print differently from what the customer saw.
 *
 * Fonts load on demand: the browser only downloads a face once a text uses it, so the canvas
 * waits for it (`loadFontsForObjects`) and then measures and draws the text again.
 */
import '@fontsource/montserrat/latin-400.css';
import '@fontsource/montserrat/latin-ext-400.css';
import '@fontsource/montserrat/latin-700.css';
import '@fontsource/montserrat/latin-ext-700.css';
import '@fontsource/montserrat/latin-400-italic.css';
import '@fontsource/montserrat/latin-ext-400-italic.css';
import '@fontsource/montserrat/latin-700-italic.css';
import '@fontsource/montserrat/latin-ext-700-italic.css';
import '@fontsource/oswald/latin-400.css';
import '@fontsource/oswald/latin-ext-400.css';
import '@fontsource/oswald/latin-700.css';
import '@fontsource/oswald/latin-ext-700.css';
import '@fontsource/playfair-display/latin-400.css';
import '@fontsource/playfair-display/latin-ext-400.css';
import '@fontsource/playfair-display/latin-700.css';
import '@fontsource/playfair-display/latin-ext-700.css';
import '@fontsource/playfair-display/latin-400-italic.css';
import '@fontsource/playfair-display/latin-ext-400-italic.css';
import '@fontsource/playfair-display/latin-700-italic.css';
import '@fontsource/playfair-display/latin-ext-700-italic.css';
import '@fontsource/roboto/latin-400.css';
import '@fontsource/roboto/latin-ext-400.css';
import '@fontsource/roboto/latin-700.css';
import '@fontsource/roboto/latin-ext-700.css';
import '@fontsource/roboto/latin-400-italic.css';
import '@fontsource/roboto/latin-ext-400-italic.css';
import '@fontsource/roboto/latin-700-italic.css';
import '@fontsource/roboto/latin-ext-700-italic.css';

export interface WorkshopFont {
  /** The CSS family name stored in a design's text layers. */
  family: string;
  /** The @fontsource package that ships it. */
  packageSlug: string;
}

/** The only fonts the text tool offers. Oswald has no italic face: the browser slants it. */
export const WORKSHOP_FONTS: readonly WorkshopFont[] = [
  { family: 'Montserrat', packageSlug: 'montserrat' },
  { family: 'Oswald', packageSlug: 'oswald' },
  { family: 'Playfair Display', packageSlug: 'playfair-display' },
  { family: 'Roboto', packageSlug: 'roboto' },
];

export const DEFAULT_FONT_FAMILY = 'Roboto';

const OFFERED = new Set(WORKSHOP_FONTS.map((f) => f.family));

export function isWorkshopFont(family: unknown): family is string {
  return typeof family === 'string' && OFFERED.has(family);
}

interface TextStyle {
  fontFamily?: unknown;
  fontWeight?: unknown;
  fontStyle?: unknown;
}

function numericWeight(weight: unknown): number {
  if (weight === 'bold') return 700;
  const n = Number(weight);
  return Number.isFinite(n) && n >= 600 ? 700 : 400;
}

/** The CSS font shorthand for `document.fonts.load` (the size does not select a face). */
export function fontDescriptor(style: TextStyle): string {
  const italic = style.fontStyle === 'italic' || style.fontStyle === 'oblique';
  return `${italic ? 'italic' : 'normal'} ${numericWeight(style.fontWeight)} 24px "${String(style.fontFamily)}"`;
}

/**
 * Ask the browser to download the faces that the given objects use. Resolves true when at
 * least one face was requested and no request failed (a family the page does not declare resolves without a face and still counts); never rejects, so a slow or failed
 * download leaves the browser fallback in place instead of breaking the editor.
 */
export async function loadFontsForObjects(
  objects: ReadonlyArray<TextStyle & { type?: unknown; text?: unknown }>,
  sample = ''
): Promise<boolean> {
  const fonts = typeof document === 'undefined' ? undefined : document.fonts;
  if (!fonts) return false;
  const descriptors = new Set<string>();
  for (const o of objects) {
    if (isWorkshopFont(o.fontFamily)) descriptors.add(fontDescriptor(o));
  }
  if (descriptors.size === 0) return false;
  // The text itself picks the subset (latin, latin-ext) the browser downloads.
  const text =
    sample || objects.map((o) => (typeof o.text === 'string' ? o.text : '')).join('') || 'Aa';
  try {
    await Promise.all([...descriptors].map((d) => fonts.load(d, text)));
    return true;
  } catch {
    return false;
  }
}
