/**
 * TTW-104: warn when an image would print blurry. The figure is the number of source pixels
 * that fall across the full width of the print area; below the threshold the image "may
 * print blurry". It is a proxy: no physical print size exists in the data yet.
 */
import {
  DEFAULT_CANVAS_SIZE,
  MIN_PIXELS_ACROSS_PRINT_AREA,
  isLowResolutionImage,
  pixelsAcrossPrintArea,
} from '@/lib/image-resolution';

const area = (width: number) => ({ width });

describe('pixelsAcrossPrintArea', () => {
  it('is the print-area width on the canvas divided by the scale', () => {
    // Area = 0.64 of a 600 px canvas = 384 px; at scale 0.5 that is 768 source pixels.
    expect(pixelsAcrossPrintArea({ scaleX: 0.5, scaleY: 0.5 }, area(0.64), 600)).toBeCloseTo(768);
  });

  it('uses the whole canvas when the view has no print area', () => {
    expect(pixelsAcrossPrintArea({ scaleX: 0.5, scaleY: 0.5 }, null, 600)).toBeCloseTo(1200);
  });

  it('judges a stretched image on its worst axis', () => {
    expect(pixelsAcrossPrintArea({ scaleX: 0.25, scaleY: 1 }, null, 600)).toBeCloseTo(600);
  });

  it('ignores flips (negative scales)', () => {
    expect(pixelsAcrossPrintArea({ scaleX: -0.5, scaleY: 0.5 }, null, 600)).toBeCloseTo(1200);
  });

  it('gives no figure when the scale or the area cannot be used', () => {
    expect(pixelsAcrossPrintArea({ scaleX: 0, scaleY: 0 }, null, 600)).toBeNull();
    expect(pixelsAcrossPrintArea({ scaleX: undefined, scaleY: 1 }, null, 600)).toBeNull();
    expect(pixelsAcrossPrintArea({ scaleX: Number.NaN, scaleY: 1 }, null, 600)).toBeNull();
    expect(pixelsAcrossPrintArea({ scaleX: 1, scaleY: 1 }, area(0), 600)).toBeNull();
    expect(pixelsAcrossPrintArea({ scaleX: 1, scaleY: 1 }, null, 0)).toBeNull();
  });
});

describe('isLowResolutionImage', () => {
  it('uses a threshold of 1200 source pixels across the print area', () => {
    expect(MIN_PIXELS_ACROSS_PRINT_AREA).toBe(1200);
    expect(DEFAULT_CANVAS_SIZE).toBe(600);
  });

  it('warns just below the threshold, not at it, not above it', () => {
    // Canvas 600, no print area: pixels across = 600 / scale.
    expect(isLowResolutionImage({ scaleX: 0.5001, scaleY: 0.5001 }, null, 600)).toBe(true);
    expect(isLowResolutionImage({ scaleX: 0.5, scaleY: 0.5 }, null, 600)).toBe(false);
    expect(isLowResolutionImage({ scaleX: 0.25, scaleY: 0.25 }, null, 600)).toBe(false);
  });

  it('warns for a small image that was enlarged', () => {
    expect(isLowResolutionImage({ scaleX: 3, scaleY: 3 }, null, 600)).toBe(true);
  });

  it('does not warn when there is nothing to judge', () => {
    expect(isLowResolutionImage({ scaleX: 0, scaleY: 0 }, null, 600)).toBe(false);
    expect(isLowResolutionImage({}, null, 600)).toBe(false);
  });
});
