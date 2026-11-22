/**
 * What the print shop prints (TTW-101).
 *
 * `Design.designData` is editable, so an order cannot point at it: the moment the customer
 * edits the design, the order would print something else. When an order is placed, the
 * sides and layers are copied onto the order item, reduced to an allowlist, and never
 * touched again. The admin order screen reads only this copy.
 *
 * Images are not copied: uploads never change, so the layer keeps the asset id. They stay
 * readable because an account that ordered cannot be deleted today; TTW-120 (erase the files
 * of deleted accounts) must keep the uploads named here.
 *
 * Pure functions: no database, no storage. `OrdersService` reads the rows and calls them.
 */

import { layerKindOf } from '../designs/design-content.validator';

export const DESIGN_SNAPSHOT_VERSION = 1;

/** Print area as stored on the product view (normalised or px, left as the admin entered it). */
export interface SnapshotPrintArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface SnapshotProductView {
  id: string;
  key: string;
  displayName: string;
  sortOrder: number;
  printArea: SnapshotPrintArea | null;
}

export interface SnapshotDesignInput {
  id: string;
  name: string;
  productId: string;
  designData: unknown;
}

type Geometry = {
  left?: number;
  top?: number;
  width?: number;
  height?: number;
  scaleX?: number;
  scaleY?: number;
  angle?: number;
  flipX?: boolean;
  flipY?: boolean;
  originX?: string;
  originY?: string;
};

export type SnapshotImageLayer = Geometry & {
  kind: 'image';
  designAssetId: string;
};

export type SnapshotTextLayer = Geometry & {
  kind: 'text';
  text: string;
  fontFamily?: string;
  fontSize?: number;
  fontWeight?: string;
  fill?: string;
  textAlign?: string;
};

export type SnapshotLayer = SnapshotImageLayer | SnapshotTextLayer;

export interface SnapshotView {
  key: string;
  displayName: string;
  sortOrder: number;
  productViewId: string;
  printArea: SnapshotPrintArea | null;
  layers: SnapshotLayer[];
}

export interface DesignSnapshot {
  version: typeof DESIGN_SNAPSHOT_VERSION;
  capturedAt: string;
  designId: string;
  designName: string;
  productId: string;
  views: SnapshotView[];
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const MAX_TEXT = 5000;
const MAX_SHORT = 200;

function pickNumber(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function pickString(source: Record<string, unknown>, key: string, max: number) {
  const value = source[key];
  return typeof value === 'string' ? value.slice(0, max) : undefined;
}

function pickBoolean(source: Record<string, unknown>, key: string) {
  const value = source[key];
  return typeof value === 'boolean' ? value : undefined;
}

/** Keep only the keys that were set, so the stored JSON stays small and stable. */
function compact<T extends Record<string, unknown>>(input: T): T {
  return Object.fromEntries(
    Object.entries(input).filter(([, value]) => value !== undefined),
  ) as T;
}

function geometryOf(layer: Record<string, unknown>): Geometry {
  return {
    left: pickNumber(layer, 'left'),
    top: pickNumber(layer, 'top'),
    width: pickNumber(layer, 'width'),
    height: pickNumber(layer, 'height'),
    scaleX: pickNumber(layer, 'scaleX'),
    scaleY: pickNumber(layer, 'scaleY'),
    angle: pickNumber(layer, 'angle'),
    flipX: pickBoolean(layer, 'flipX'),
    flipY: pickBoolean(layer, 'flipY'),
    originX: pickString(layer, 'originX', 20),
    originY: pickString(layer, 'originY', 20),
  };
}

function assetIdOf(layer: Record<string, unknown>): string | undefined {
  const data = layer['data'];
  const fromData = isRecord(data) ? data['designAssetId'] : undefined;
  const id = typeof fromData === 'string' ? fromData : layer['designAssetId'];
  return typeof id === 'string' && id.length > 0
    ? id.slice(0, MAX_SHORT)
    : undefined;
}

function toSnapshotLayer(raw: unknown): SnapshotLayer | null {
  if (!isRecord(raw)) return null;
  // Same type rules as the save-time check: the workshop's text is an `IText`.
  const kind = layerKindOf(raw['type']);

  if (kind === 'image') {
    const designAssetId = assetIdOf(raw);
    // An image with no asset is something the print shop could not fetch: do not invent one.
    if (!designAssetId) return null;
    return compact({
      kind: 'image' as const,
      designAssetId,
      ...geometryOf(raw),
    });
  }

  if (kind === 'text') {
    const text = pickString(raw, 'text', MAX_TEXT);
    if (text === undefined) return null;
    return compact({
      kind: 'text' as const,
      text,
      fontFamily: pickString(raw, 'fontFamily', MAX_SHORT),
      fontSize: pickNumber(raw, 'fontSize'),
      fontWeight: pickString(raw, 'fontWeight', 20),
      fill: pickString(raw, 'fill', MAX_SHORT),
      textAlign: pickString(raw, 'textAlign', 20),
      ...geometryOf(raw),
    });
  }

  return null;
}

function layersOfView(view: Record<string, unknown>): SnapshotLayer[] {
  const fabricJson = view['fabricJson'];
  const objects =
    isRecord(fabricJson) && Array.isArray(fabricJson['objects'])
      ? fabricJson['objects']
      : Array.isArray(view['layers'])
        ? view['layers'] // legacy format, same rules per layer
        : [];
  return objects.flatMap((object) => {
    const layer = toSnapshotLayer(object);
    return layer ? [layer] : [];
  });
}

/**
 * Copy what the print shop needs from a design, for the sides the product really has.
 * Sides appear in the product's order and only when they hold at least one printable layer.
 */
export function buildDesignSnapshot(
  design: SnapshotDesignInput,
  productViews: SnapshotProductView[],
  now: Date,
): DesignSnapshot {
  const data = isRecord(design.designData) ? design.designData : {};
  const rawViews = isRecord(data['views']) ? data['views'] : {};

  const views: SnapshotView[] = [];
  for (const productView of [...productViews].sort(
    (a, b) => a.sortOrder - b.sortOrder,
  )) {
    const raw = rawViews[productView.key];
    if (!isRecord(raw)) continue;
    const layers = layersOfView(raw);
    if (layers.length === 0) continue;
    views.push({
      key: productView.key,
      displayName: productView.displayName,
      sortOrder: productView.sortOrder,
      productViewId: productView.id,
      printArea: productView.printArea ? { ...productView.printArea } : null,
      layers,
    });
  }

  return {
    version: DESIGN_SNAPSHOT_VERSION,
    capturedAt: now.toISOString(),
    designId: design.id,
    designName: design.name,
    productId: design.productId,
    views,
  };
}

/** Facts about an uploaded original, read from `MediaAsset`. Never a storage key or URL. */
export interface PrintFileFacts {
  mimeType: string | null;
  bytes: number | null;
  width: number | null;
  height: number | null;
  status: string;
}

export type AdminPrintImageLayer = SnapshotImageLayer & {
  /** Stable API path of the on-screen rendition (admin session needed). */
  previewPath: string;
  /** Stable API path that returns a fresh, short-lived signed link to the original. */
  originalLinkPath: string;
  /** Null when the file no longer exists. */
  file: PrintFileFacts | null;
};

export type AdminPrintLayer = AdminPrintImageLayer | SnapshotTextLayer;

export interface AdminPrintFiles {
  designName: string;
  capturedAt: string;
  views: Array<Omit<SnapshotView, 'layers'> & { layers: AdminPrintLayer[] }>;
}

/** Ids of the uploads a stored snapshot uses, so the caller can read them in one query. */
export function designAssetIdsOf(snapshot: unknown): string[] {
  if (!isStoredSnapshot(snapshot)) return [];
  const ids = new Set<string>();
  for (const view of snapshot.views) {
    for (const layer of view.layers) {
      if (layer.kind === 'image') ids.add(layer.designAssetId);
    }
  }
  return [...ids];
}

function isStoredSnapshot(value: unknown): value is DesignSnapshot {
  return (
    isRecord(value) &&
    value['version'] === DESIGN_SNAPSHOT_VERSION &&
    Array.isArray(value['views'])
  );
}

/**
 * Admin view of a stored snapshot. Null for an item without one (no design, or placed
 * before TTW-101) and for a version this code does not know: the admin then says so rather
 * than read the live design.
 */
export function toAdminPrintFiles(
  snapshot: unknown,
  assets: ReadonlyMap<string, PrintFileFacts>,
): AdminPrintFiles | null {
  if (!isStoredSnapshot(snapshot)) return null;
  return {
    designName: snapshot.designName,
    capturedAt: snapshot.capturedAt,
    views: snapshot.views.map((view) => ({
      ...view,
      layers: view.layers.map((layer): AdminPrintLayer => {
        if (layer.kind !== 'image') return layer;
        const id = encodeURIComponent(layer.designAssetId);
        return {
          ...layer,
          previewPath: `/design-assets/${id}/file?variant=display`,
          originalLinkPath: `/design-assets/${id}/link?variant=original`,
          file: assets.get(layer.designAssetId) ?? null,
        };
      }),
    })),
  };
}
