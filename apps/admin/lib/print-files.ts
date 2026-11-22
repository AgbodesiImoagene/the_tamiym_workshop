/**
 * What the print shop reads on an admin order (TTW-101). Mirrors `AdminPrintFiles` in
 * apps/api/src/orders/order-item-design-snapshot.ts: the API builds it from the copy of
 * the design frozen when the order was placed, never from the live design.
 */
import { apiClient } from '@/lib/api';

/** The Design Workshop canvas is a 600 px square: layer positions are in those pixels. */
export const PRINT_CANVAS_SIZE = 600;

export interface PrintArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface LayerGeometry {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  flipX?: boolean;
  flipY?: boolean;
  skewX?: number;
  skewY?: number;
  originX?: string;
  originY?: string;
  opacity?: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  backgroundColor?: string;
}

export interface PrintFileFacts {
  mimeType: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  status: string;
}

export type PrintImageLayer = LayerGeometry & {
  kind: 'image';
  designAssetId: string;
  cropX?: number;
  cropY?: number;
  previewPath: string;
  originalLinkPath: string;
  file: PrintFileFacts | null;
};

export type PrintTextLayer = LayerGeometry & {
  kind: 'text';
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fontStyle?: string;
  textAlign?: string;
  lineHeight?: number;
  charSpacing?: number;
  underline?: boolean;
  overline?: boolean;
  linethrough?: boolean;
  textBackgroundColor?: string;
};

export type PrintLayer = PrintImageLayer | PrintTextLayer;

export interface PrintView {
  key: string;
  displayName: string;
  sortOrder: number;
  productViewId: string;
  printArea: PrintArea | null;
  layers: PrintLayer[];
}

export interface PrintFiles {
  designName: string;
  capturedAt: string;
  views: PrintView[];
}

const API_BASE_URL = () => process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/v1';

/** Address of a stable API path such as `/design-assets/<id>/file?variant=display`. */
export function apiPathHref(path: string): string | null {
  // Only our own stable paths: a stored value can never become a script or another host.
  if (!path.startsWith('/design-assets/') || path.startsWith('//')) return null;
  return `${API_BASE_URL()}${path}`;
}

/**
 * Print area as canvas pixels. Stored as fractions (0..1) or already in pixels. The two cannot
 * be told apart when every number is between 0 and 1, so such an area is read as fractions.
 */
export function printAreaInCanvas(area: PrintArea | null): PrintArea | null {
  if (!area) return null;
  const fractional = [area.x, area.y, area.width, area.height].every((n) => n >= 0 && n <= 1);
  if (!fractional) return area;
  return {
    x: area.x * PRINT_CANVAS_SIZE,
    y: area.y * PRINT_CANVAS_SIZE,
    width: area.width * PRINT_CANVAS_SIZE,
    height: area.height * PRINT_CANVAS_SIZE,
  };
}

/** Size, top-left corner and turn of a layer, in canvas pixels, whatever its origin. */
export function layerBox(layer: LayerGeometry) {
  const width = (layer.width ?? 0) * (layer.scaleX ?? 1);
  const height = (layer.height ?? 0) * (layer.scaleY ?? 1);
  const left = layer.left ?? 0;
  const top = layer.top ?? 0;
  const x =
    layer.originX === 'center' ? left - width / 2 : layer.originX === 'right' ? left - width : left;
  const y =
    layer.originY === 'center' ? top - height / 2 : layer.originY === 'bottom' ? top - height : top;
  // Fabric turns a layer around its origin point (left, top), not around a corner of the box.
  return { x, y, width, height, angle: layer.angle ?? 0, pivotX: left, pivotY: top };
}

/** SVG transform that mirrors a layer inside its box, as Fabric's flipX and flipY do. */
export function flipTransform(layer: LayerGeometry): string | undefined {
  const box = layerBox(layer);
  const parts: string[] = [];
  if (layer.flipX) parts.push(`translate(${2 * box.x + box.width} 0) scale(-1 1)`);
  if (layer.flipY) parts.push(`translate(0 ${2 * box.y + box.height}) scale(1 -1)`);
  return parts.length > 0 ? parts.join(' ') : undefined;
}

export interface PrintLink {
  url: string;
  expiresInSeconds: number;
}

/** A fresh short-lived signed link to an original file. Asked on click: never stored or shown. */
export async function getOriginalFileLink(originalLinkPath: string): Promise<PrintLink> {
  if (!originalLinkPath.startsWith('/design-assets/')) {
    throw new Error('Unexpected file address.');
  }
  return apiClient.get<PrintLink>(originalLinkPath);
}
