/**
 * Strict allowlist for the JSON of a saved design (TTW-100).
 *
 * `designData` is written by the browser, so nothing in it can be trusted. The server only
 * accepts what the Workshop editor produces: text and image layers, serialised by Fabric,
 * where every image is one of the owner's own uploads (`data.designAssetId`) served by our
 * stable API path. Anything else (external or foreign images, other object types, unknown
 * fields, pattern fills, clip paths, background images) is refused with a stable code the
 * editor can show.
 *
 * This file only inspects the document. That the assets exist, belong to the design owner
 * and are READY needs the database and is checked by `DesignsService`.
 */

/** Stable error codes returned to the editor. Never rename one: clients match on them. */
export const DESIGN_CONTENT_ERROR = {
  TOO_LARGE: 'DESIGN_TOO_LARGE',
  STRUCTURE_INVALID: 'DESIGN_STRUCTURE_INVALID',
  FIELD_NOT_ALLOWED: 'DESIGN_FIELD_NOT_ALLOWED',
  FIELD_VALUE_INVALID: 'DESIGN_FIELD_VALUE_INVALID',
  OBJECT_TYPE_NOT_ALLOWED: 'DESIGN_OBJECT_TYPE_NOT_ALLOWED',
  IMAGE_EXTERNAL: 'DESIGN_IMAGE_EXTERNAL',
  IMAGE_ASSET_MISSING: 'DESIGN_IMAGE_ASSET_MISSING',
  ASSET_NOT_FOUND: 'DESIGN_ASSET_NOT_FOUND',
  ASSET_NOT_READY: 'DESIGN_ASSET_NOT_READY',
  ASSET_NOT_APPROVED: 'DESIGN_ASSET_NOT_APPROVED',
} as const;

export type DesignContentErrorCode =
  (typeof DESIGN_CONTENT_ERROR)[keyof typeof DESIGN_CONTENT_ERROR];

export type DesignContentResult =
  | { ok: true; assetIds: Set<string> }
  | { ok: false; code: DesignContentErrorCode; message: string };

export interface DesignContentOptions {
  /** Public base URL of this API, for example `https://api.example.com/v1`. */
  apiPublicUrl: string | undefined;
}

/** Layers in one view. The editor adds layers by hand, so this is generous. */
const MAX_LAYERS_PER_VIEW = 200;
const MAX_TEXT_LENGTH = 5000;
const MAX_STRING_LENGTH = 200;
const IMAGE_VARIANTS = new Set(['original', 'display', 'thumb']);
const CROSS_ORIGINS = new Set(['anonymous', 'use-credentials']);

type Kind =
  | 'number'
  | 'string'
  | 'boolean'
  | 'colour'
  | 'nullOnly'
  | 'emptyArray'
  | 'strokeDash'
  | 'styles';

/** Fields of every Fabric object, as `toObject()` emits them in Fabric 7. */
const COMMON_FIELDS: Record<string, Kind> = {
  type: 'string',
  version: 'string',
  originX: 'string',
  originY: 'string',
  left: 'number',
  top: 'number',
  width: 'number',
  height: 'number',
  fill: 'colour',
  stroke: 'colour',
  strokeWidth: 'number',
  strokeDashArray: 'strokeDash',
  strokeLineCap: 'string',
  strokeDashOffset: 'number',
  strokeLineJoin: 'string',
  strokeUniform: 'boolean',
  strokeMiterLimit: 'number',
  scaleX: 'number',
  scaleY: 'number',
  angle: 'number',
  flipX: 'boolean',
  flipY: 'boolean',
  opacity: 'number',
  // A shadow or a filter is never set on a customer layer: only null / empty is valid.
  shadow: 'nullOnly',
  visible: 'boolean',
  backgroundColor: 'colour',
  fillRule: 'string',
  paintFirst: 'string',
  globalCompositeOperation: 'string',
  skewX: 'number',
  skewY: 'number',
};

const TEXT_FIELDS: Record<string, Kind> = {
  fontSize: 'number',
  fontWeight: 'string',
  fontFamily: 'string',
  fontStyle: 'string',
  lineHeight: 'number',
  text: 'string',
  charSpacing: 'number',
  textAlign: 'string',
  styles: 'styles',
  pathStartOffset: 'number',
  pathSide: 'string',
  pathAlign: 'string',
  underline: 'boolean',
  overline: 'boolean',
  linethrough: 'boolean',
  textBackgroundColor: 'colour',
  direction: 'string',
  textDecorationThickness: 'number',
  minWidth: 'number',
  splitByGrapheme: 'boolean',
  // The tools set these when they add a layer, before Fabric serialises it.
  selectable: 'boolean',
  editable: 'boolean',
};

const IMAGE_FIELDS: Record<string, Kind> = {
  cropX: 'number',
  cropY: 'number',
  filters: 'emptyArray',
  selectable: 'boolean',
  // `src` and `crossOrigin` have their own rules, see `checkImage`.
};

const VIEW_FIELDS = new Set([
  'productViewId',
  'fabricJson',
  'isUsed',
  'layerCount',
  'layers',
]);
const FABRIC_JSON_FIELDS = new Set(['version', 'objects', 'background']);
const TOP_LEVEL_FIELDS = new Set(['version', 'productId', 'views']);
const DATA_FIELDS = new Set(['designAssetId', 'layerId']);

const fail = (
  code: DesignContentErrorCode,
  message: string,
): { ok: false; code: DesignContentErrorCode; message: string } => ({
  ok: false,
  code,
  message,
});

type Failure = ReturnType<typeof fail>;

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

const hasOwn = (target: object, key: string): boolean =>
  Object.prototype.hasOwnProperty.call(target, key);

/** `i-text`, `IText`, `itext` all become `itext`. */
const normaliseType = (type: string): string =>
  type.toLowerCase().replace(/[^a-z]/g, '');

type ObjectKind = 'text' | 'image';

const OBJECT_KINDS: Record<string, ObjectKind> = {
  itext: 'text',
  textbox: 'text',
  text: 'text',
  image: 'image',
};

/**
 * Every field the save-time check accepts on a layer, by kind (TTW-101). The frozen copy of
 * an order keeps some of them and drops the rest on purpose; a test lists every one of
 * these, so a field added here forces a decision there instead of being lost silently.
 */
export const ACCEPTED_LAYER_FIELDS: Record<ObjectKind, readonly string[]> = {
  text: Object.keys({ ...COMMON_FIELDS, ...TEXT_FIELDS }),
  image: Object.keys({ ...COMMON_FIELDS, ...IMAGE_FIELDS }),
};

/**
 * Kind of a Fabric object type, by the rules the save-time check uses (every spelling of
 * `IText`, `Textbox`, `Text` and `Image`), or null for a type that is refused. Shared with
 * the frozen copy of an order (TTW-101), so a layer that was accepted at save time is never
 * dropped when the order is placed.
 */
export function layerKindOf(type: unknown): ObjectKind | null {
  if (typeof type !== 'string') return null;
  const key = normaliseType(type);
  return hasOwn(OBJECT_KINDS, key) ? OBJECT_KINDS[key] : null;
}

function colourOk(value: unknown): boolean {
  // Colours are plain strings. A gradient or pattern object is refused: a pattern
  // carries its own image source.
  return (
    value === null ||
    (typeof value === 'string' && value.length <= MAX_STRING_LENGTH)
  );
}

/** Properties Fabric writes in a per-character text style, with the type of each. */
const CHARACTER_STYLE_FIELDS: Record<string, 'number' | 'string' | 'boolean'> =
  {
    fill: 'string',
    stroke: 'string',
    strokeWidth: 'number',
    fontSize: 'number',
    fontFamily: 'string',
    fontWeight: 'string',
    fontStyle: 'string',
    underline: 'boolean',
    overline: 'boolean',
    linethrough: 'boolean',
    deltaY: 'number',
    textBackgroundColor: 'string',
    textDecorationThickness: 'number',
  };

function characterStyleOk(value: unknown): boolean {
  if (!isPlainObject(value)) return false;
  return Object.keys(value).every((key) => {
    if (!hasOwn(CHARACTER_STYLE_FIELDS, key)) return false;
    const item = value[key];
    switch (CHARACTER_STYLE_FIELDS[key]) {
      case 'number':
        return typeof item === 'number' && Number.isFinite(item);
      case 'boolean':
        return typeof item === 'boolean';
      case 'string':
        return typeof item === 'string' && item.length <= MAX_STRING_LENGTH;
    }
  });
}

/**
 * `styles` of a text layer, in the two shapes Fabric writes: a list of
 * `{ start, end, style }` ranges, or `{ line: { character: style } }`. Only known style
 * properties are allowed at the leaves, so no other key (an asset id, a URL) can ride in
 * a free-form object that other readers of the design walk.
 */
function stylesOk(value: unknown): boolean {
  if (Array.isArray(value)) {
    return value.every(
      (range) =>
        isPlainObject(range) &&
        Object.keys(range).every((k) =>
          ['start', 'end', 'style'].includes(k),
        ) &&
        typeof range['start'] === 'number' &&
        typeof range['end'] === 'number' &&
        characterStyleOk(range['style']),
    );
  }
  if (isPlainObject(value)) {
    return Object.values(value).every(
      (line) =>
        isPlainObject(line) && Object.values(line).every(characterStyleOk),
    );
  }
  return false;
}

function valueOk(kind: Kind, value: unknown, key: string): boolean {
  switch (kind) {
    case 'number':
      return typeof value === 'number' && Number.isFinite(value);
    case 'string':
      return (
        typeof value === 'string' &&
        value.length <= (key === 'text' ? MAX_TEXT_LENGTH : MAX_STRING_LENGTH)
      );
    case 'boolean':
      return typeof value === 'boolean';
    case 'colour':
      return colourOk(value);
    case 'nullOnly':
      return value === null;
    case 'emptyArray':
      return Array.isArray(value) && value.length === 0;
    case 'strokeDash':
      return (
        value === null ||
        (Array.isArray(value) &&
          value.length <= 8 &&
          value.every((n) => typeof n === 'number' && Number.isFinite(n)))
      );
    case 'styles':
      return stylesOk(value);
  }
}

function checkFields(
  object: Record<string, unknown>,
  allowed: Record<string, Kind>,
  extraKeys: readonly string[],
  where: string,
): Failure | null {
  for (const key of Object.keys(object)) {
    if (extraKeys.includes(key)) continue;
    const kind = hasOwn(allowed, key) ? allowed[key] : undefined;
    if (!kind) {
      return fail(
        DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED,
        `${where}: field "${key.slice(0, 40)}" is not allowed`,
      );
    }
    if (!valueOk(kind, object[key], key)) {
      return fail(
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
        `${where}: field "${key}" has an invalid value`,
      );
    }
  }
  return null;
}

/** Base path of the API, without a trailing slash: `/v1` for `https://x/v1/`. */
function parseApiBase(
  apiPublicUrl: string | undefined,
): { origin: string; path: string } | null {
  if (!apiPublicUrl) return null;
  try {
    const url = new URL(apiPublicUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return { origin: url.origin, path: url.pathname.replace(/\/+$/, '') };
  } catch {
    return null;
  }
}

/** True when `src` is exactly our stable path for `assetId`, on our own origin. */
function isOwnAssetUrl(
  src: unknown,
  assetId: string,
  base: { origin: string; path: string } | null,
): boolean {
  if (typeof src !== 'string' || !base) return false;
  let url: URL;
  try {
    url = new URL(src);
  } catch {
    return false; // relative, empty or malformed
  }
  if (url.origin !== base.origin || url.username || url.password) return false;
  if (url.hash) return false;
  if (url.pathname !== `${base.path}/design-assets/${assetId}/file`) {
    return false;
  }
  const params = [...url.searchParams.keys()];
  if (params.length === 0) return true;
  const variant = url.searchParams.get('variant');
  return (
    params.length === 1 &&
    params[0] === 'variant' &&
    variant !== null &&
    IMAGE_VARIANTS.has(variant)
  );
}

function assetIdOf(object: Record<string, unknown>): {
  id: string | null;
  conflict: boolean;
} {
  const data = object['data'];
  const fromData =
    isPlainObject(data) && typeof data['designAssetId'] === 'string'
      ? data['designAssetId']
      : null;
  const top =
    typeof object['designAssetId'] === 'string'
      ? object['designAssetId']
      : null;
  if (fromData && top && fromData !== top) return { id: null, conflict: true };
  const id = fromData ?? top;
  return { id: id && id.length > 0 ? id : null, conflict: false };
}

function checkObject(
  object: unknown,
  where: string,
  base: { origin: string; path: string } | null,
  assetIds: Set<string>,
  legacyLayer: boolean,
): Failure | null {
  if (!isPlainObject(object)) {
    return fail(
      DESIGN_CONTENT_ERROR.STRUCTURE_INVALID,
      `${where}: a layer must be an object`,
    );
  }
  const type = object['type'];
  const kind =
    typeof type === 'string' && hasOwn(OBJECT_KINDS, normaliseType(type))
      ? OBJECT_KINDS[normaliseType(type)]
      : undefined;
  if (!kind) {
    return fail(
      DESIGN_CONTENT_ERROR.OBJECT_TYPE_NOT_ALLOWED,
      `${where}: object type is not allowed`,
    );
  }

  const fields = kind === 'text' ? TEXT_FIELDS : IMAGE_FIELDS;
  const allowed = { ...COMMON_FIELDS, ...fields };
  // `data` and `designAssetId` are checked below; `src` and `crossOrigin` are image-only;
  // `content` is the legacy text field.
  const extra = ['data', 'designAssetId'];
  if (kind === 'image') extra.push('src', 'crossOrigin');
  if (legacyLayer && kind === 'text') extra.push('content');
  const fieldFailure = checkFields(object, allowed, extra, where);
  if (fieldFailure) return fieldFailure;
  if (legacyLayer && kind === 'text' && 'content' in object) {
    const content = object['content'];
    if (typeof content !== 'string' || content.length > MAX_TEXT_LENGTH) {
      return fail(
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
        `${where}: field "content" has an invalid value`,
      );
    }
  }

  const data = object['data'];
  if (data !== undefined) {
    if (!isPlainObject(data)) {
      return fail(
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
        `${where}: field "data" has an invalid value`,
      );
    }
    for (const key of Object.keys(data)) {
      if (!DATA_FIELDS.has(key)) {
        return fail(
          DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED,
          `${where}: data field "${key.slice(0, 40)}" is not allowed`,
        );
      }
      if (
        typeof data[key] !== 'string' ||
        data[key].length > MAX_STRING_LENGTH
      ) {
        return fail(
          DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
          `${where}: data field "${key}" has an invalid value`,
        );
      }
    }
  }
  if (
    object['designAssetId'] !== undefined &&
    typeof object['designAssetId'] !== 'string'
  ) {
    return fail(
      DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      `${where}: field "designAssetId" has an invalid value`,
    );
  }

  if (kind === 'text') {
    // Only images name a design asset. A text layer carrying an id would skip the
    // ownership check, yet the shared-design reader counts any `designAssetId` key.
    const dataIds = isPlainObject(data) && 'designAssetId' in data;
    if (dataIds || 'designAssetId' in object) {
      return fail(
        DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED,
        `${where}: a text layer cannot reference a design asset`,
      );
    }
    return null;
  }
  return checkImage(object, where, base, assetIds);
}

function checkImage(
  object: Record<string, unknown>,
  where: string,
  base: { origin: string; path: string } | null,
  assetIds: Set<string>,
): Failure | null {
  const { id, conflict } = assetIdOf(object);
  if (!id) {
    return fail(
      DESIGN_CONTENT_ERROR.IMAGE_ASSET_MISSING,
      conflict
        ? `${where}: the image names two different design assets`
        : `${where}: an image must reference one of your uploads`,
    );
  }
  if (object['src'] !== undefined && !isOwnAssetUrl(object['src'], id, base)) {
    return fail(
      DESIGN_CONTENT_ERROR.IMAGE_EXTERNAL,
      `${where}: images must be your own uploads, external images are not allowed`,
    );
  }
  const crossOrigin = object['crossOrigin'];
  if (
    crossOrigin !== undefined &&
    crossOrigin !== null &&
    !(typeof crossOrigin === 'string' && CROSS_ORIGINS.has(crossOrigin))
  ) {
    return fail(
      DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      `${where}: field "crossOrigin" has an invalid value`,
    );
  }
  assetIds.add(id);
  return null;
}

function checkLayers(
  layers: unknown,
  where: string,
  base: { origin: string; path: string } | null,
  assetIds: Set<string>,
  legacyLayer: boolean,
): Failure | null {
  if (!Array.isArray(layers)) {
    return fail(
      DESIGN_CONTENT_ERROR.STRUCTURE_INVALID,
      `${where}: layers must be a list`,
    );
  }
  if (layers.length > MAX_LAYERS_PER_VIEW) {
    return fail(
      DESIGN_CONTENT_ERROR.STRUCTURE_INVALID,
      `${where}: a view can hold at most ${MAX_LAYERS_PER_VIEW} layers`,
    );
  }
  for (const [index, layer] of layers.entries()) {
    const failure = checkObject(
      layer,
      `${where}[${index}]`,
      base,
      assetIds,
      legacyLayer,
    );
    if (failure) return failure;
  }
  return null;
}

function checkView(
  view: unknown,
  where: string,
  base: { origin: string; path: string } | null,
  assetIds: Set<string>,
): Failure | null {
  if (!isPlainObject(view)) {
    return fail(
      DESIGN_CONTENT_ERROR.STRUCTURE_INVALID,
      `${where}: a view must be an object`,
    );
  }
  for (const key of Object.keys(view)) {
    if (!VIEW_FIELDS.has(key)) {
      return fail(
        DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED,
        `${where}: field "${key.slice(0, 40)}" is not allowed`,
      );
    }
  }
  if (
    (view['productViewId'] !== undefined &&
      typeof view['productViewId'] !== 'string') ||
    (view['isUsed'] !== undefined && typeof view['isUsed'] !== 'boolean') ||
    (view['layerCount'] !== undefined &&
      !(
        typeof view['layerCount'] === 'number' &&
        Number.isFinite(view['layerCount'])
      ))
  ) {
    return fail(
      DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      `${where}: a view field has an invalid value`,
    );
  }

  const fabricJson = view['fabricJson'];
  if (fabricJson !== undefined) {
    if (!isPlainObject(fabricJson)) {
      return fail(
        DESIGN_CONTENT_ERROR.STRUCTURE_INVALID,
        `${where}.fabricJson must be an object`,
      );
    }
    for (const key of Object.keys(fabricJson)) {
      if (!FABRIC_JSON_FIELDS.has(key)) {
        // Includes `backgroundImage` and `clipPath`: another place an image could hide.
        return fail(
          DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED,
          `${where}.fabricJson: field "${key.slice(0, 40)}" is not allowed`,
        );
      }
    }
    if (
      (fabricJson['version'] !== undefined &&
        typeof fabricJson['version'] !== 'string') ||
      (fabricJson['background'] !== undefined &&
        !(
          typeof fabricJson['background'] === 'string' &&
          fabricJson['background'].length <= MAX_STRING_LENGTH
        ))
    ) {
      return fail(
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
        `${where}.fabricJson: a field has an invalid value`,
      );
    }
    if (fabricJson['objects'] !== undefined) {
      const failure = checkLayers(
        fabricJson['objects'],
        `${where}.fabricJson.objects`,
        base,
        assetIds,
        false,
      );
      if (failure) return failure;
    }
  }

  if (view['layers'] !== undefined) {
    // Legacy format, still read by the moderation text extraction: same rules per layer.
    return checkLayers(view['layers'], `${where}.layers`, base, assetIds, true);
  }
  return null;
}

/**
 * Check a design document against the allowlist. Returns the ids of the design assets it
 * uses so the caller can check ownership and readiness, or the first violation found.
 */
export function inspectDesignContent(
  designData: Record<string, unknown>,
  options: DesignContentOptions,
): DesignContentResult {
  const base = parseApiBase(options.apiPublicUrl);
  const assetIds = new Set<string>();

  for (const key of Object.keys(designData)) {
    if (!TOP_LEVEL_FIELDS.has(key)) {
      return fail(
        DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED,
        `designData: field "${key.slice(0, 40)}" is not allowed`,
      );
    }
  }
  if (
    (designData['version'] !== undefined &&
      !(
        typeof designData['version'] === 'number' &&
        Number.isFinite(designData['version'])
      )) ||
    (designData['productId'] !== undefined &&
      typeof designData['productId'] !== 'string')
  ) {
    return fail(
      DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      'designData: version or productId has an invalid value',
    );
  }

  const views = designData['views'];
  if (views === undefined) return { ok: true, assetIds };
  if (!isPlainObject(views)) {
    return fail(
      DESIGN_CONTENT_ERROR.STRUCTURE_INVALID,
      'designData.views must be an object',
    );
  }
  for (const [viewKey, view] of Object.entries(views)) {
    const failure = checkView(
      view,
      `views.${viewKey.slice(0, 40)}`,
      base,
      assetIds,
    );
    if (failure) return failure;
  }
  return { ok: true, assetIds };
}
