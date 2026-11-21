/**
 * TTW-104: warn when an image would print blurry.
 *
 * The data holds no physical print size (a print area is a fraction of the canvas), so the
 * real resolution in pixels per inch cannot be known. As a proxy we count the source pixels
 * that fall across the full width of the print area. The image's own pixel size cancels out:
 * its scale already says how many source pixels sit under one canvas pixel.
 *
 *   pixels across the area = print-area width on the canvas / scale
 *
 * Below `MIN_PIXELS_ACROSS_PRINT_AREA` the image "may print blurry". On a print area about
 * 30 cm wide, 1200 pixels is roughly 100 pixels per inch.
 */

/** Source pixels across the print-area width below which the warning shows (business value). */
export const MIN_PIXELS_ACROSS_PRINT_AREA = 1200;

/** Width of the workshop canvas in pixels; `WorkshopCanvas` draws at this size. */
export const DEFAULT_CANVAS_SIZE = 600;

/** The parts of a Fabric image (as saved in the design JSON) this calculation reads. */
export interface ImageScale {
  scaleX?: unknown;
  scaleY?: unknown;
}

/** The part of a print area this calculation reads: its width as a fraction of the canvas. */
export interface PrintAreaWidth {
  width: number;
}

const usable = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n !== 0;

/**
 * Source pixels across the full print-area width, or null when it cannot be worked out
 * (no usable scale, or a print area or canvas with no width). With no print area the whole
 * canvas width stands in for it. Flips (negative scales) do not matter, and a stretched image
 * is judged on its worst axis.
 */
export function pixelsAcrossPrintArea(
  image: ImageScale,
  printArea: PrintAreaWidth | null,
  canvasWidth: number = DEFAULT_CANVAS_SIZE
): number | null {
  if (!usable(image.scaleX) || !usable(image.scaleY)) return null;
  const areaOnCanvas = (printArea ? printArea.width : 1) * canvasWidth;
  if (!Number.isFinite(areaOnCanvas) || areaOnCanvas <= 0) return null;
  return areaOnCanvas / Math.max(Math.abs(image.scaleX), Math.abs(image.scaleY));
}

/** True when the image may print blurry. False when there is nothing to judge. */
export function isLowResolutionImage(
  image: ImageScale,
  printArea: PrintAreaWidth | null,
  canvasWidth: number = DEFAULT_CANVAS_SIZE
): boolean {
  const pixels = pixelsAcrossPrintArea(image, printArea, canvasWidth);
  return pixels !== null && pixels < MIN_PIXELS_ACROSS_PRINT_AREA;
}
