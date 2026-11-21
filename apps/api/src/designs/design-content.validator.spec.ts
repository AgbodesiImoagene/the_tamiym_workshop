import {
  DESIGN_CONTENT_ERROR,
  inspectDesignContent,
} from './design-content.validator';

const API = 'https://api.example.com/v1';
const opts = { apiPublicUrl: API };

/** What Fabric 7 `toObject(['designAssetId', 'data'])` emits for an IText (captured from the editor). */
const editorText = {
  fontSize: 40,
  fontWeight: 'normal',
  fontFamily: 'Times New Roman',
  fontStyle: 'normal',
  lineHeight: 1.16,
  text: 'Community Day',
  charSpacing: 0,
  textAlign: 'left',
  styles: [],
  pathStartOffset: 0,
  pathSide: 'left',
  pathAlign: 'baseline',
  underline: false,
  overline: false,
  linethrough: false,
  textBackgroundColor: '',
  direction: 'ltr',
  textDecorationThickness: 66.667,
  data: { layerId: 'layer-1' },
  type: 'IText',
  version: '7.4.0',
  originX: 'center',
  originY: 'center',
  left: 50,
  top: 50,
  width: 31.1133,
  height: 45.2,
  fill: 'rgb(0,0,0)',
  stroke: null,
  strokeWidth: 1,
  strokeDashArray: null,
  strokeLineCap: 'butt',
  strokeDashOffset: 0,
  strokeLineJoin: 'miter',
  strokeUniform: false,
  strokeMiterLimit: 4,
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  flipX: false,
  flipY: false,
  opacity: 1,
  shadow: null,
  visible: true,
  backgroundColor: '',
  fillRule: 'nonzero',
  paintFirst: 'fill',
  globalCompositeOperation: 'source-over',
  skewX: 0,
  skewY: 0,
};

/** The same for a FabricImage whose `src` is the stable private path (TTW-099). */
const editorImage = (assetId = 'da_1', src?: string) => ({
  cropX: 0,
  cropY: 0,
  data: { designAssetId: assetId, layerId: 'layer-2' },
  type: 'Image',
  version: '7.4.0',
  originX: 'center',
  originY: 'center',
  left: 50,
  top: 50,
  width: 800,
  height: 600,
  fill: 'rgb(0,0,0)',
  stroke: null,
  strokeWidth: 0,
  strokeDashArray: null,
  strokeLineCap: 'butt',
  strokeDashOffset: 0,
  strokeLineJoin: 'miter',
  strokeUniform: false,
  strokeMiterLimit: 4,
  scaleX: 0.5,
  scaleY: 0.5,
  angle: 0,
  flipX: false,
  flipY: false,
  opacity: 1,
  shadow: null,
  visible: true,
  backgroundColor: '',
  fillRule: 'nonzero',
  paintFirst: 'fill',
  globalCompositeOperation: 'source-over',
  skewX: 0,
  skewY: 0,
  src: src ?? `${API}/design-assets/${assetId}/file?variant=original`,
  crossOrigin: 'use-credentials',
  filters: [],
});

const design = (
  objects: unknown[],
  extraView: Record<string, unknown> = {},
) => ({
  version: 1,
  productId: 'prod-1',
  views: {
    front: {
      productViewId: 'pv-1',
      isUsed: objects.length > 0,
      layerCount: objects.length,
      fabricJson: { objects },
      ...extraView,
    },
  },
});

const refused = (data: unknown, code: string) => {
  const result = inspectDesignContent(data as Record<string, unknown>, opts);
  expect(result).toMatchObject({ ok: false, code });
};

describe('inspectDesignContent (TTW-100)', () => {
  describe('designs the editor produces today', () => {
    it('accepts an empty design and an empty view', () => {
      expect(inspectDesignContent({}, opts)).toEqual({
        ok: true,
        assetIds: new Set(),
      });
      expect(inspectDesignContent({ version: 1, views: {} }, opts).ok).toBe(
        true,
      );
      expect(inspectDesignContent(design([]), opts).ok).toBe(true);
    });

    it('accepts text and image layers exactly as Fabric serialises them', () => {
      const result = inspectDesignContent(
        design([editorText, editorImage('da_1'), editorImage('da_2')]),
        opts,
      );
      expect(result).toEqual({ ok: true, assetIds: new Set(['da_1', 'da_2']) });
    });

    it('accepts the objects the tools add before a first save (lowercase types)', () => {
      const result = inspectDesignContent(
        design([
          {
            type: 'i-text',
            text: 'Hi',
            fontSize: 40,
            fill: '#000000',
            left: 50,
            top: 50,
          },
          {
            type: 'image',
            src: `${API}/design-assets/da_1/file?variant=original`,
            data: { designAssetId: 'da_1' },
          },
        ]),
        opts,
      );
      expect(result.ok).toBe(true);
    });

    it('accepts a Textbox and a display or thumb variant', () => {
      const result = inspectDesignContent(
        design([
          {
            ...editorText,
            type: 'Textbox',
            minWidth: 20,
            splitByGrapheme: false,
          },
          editorImage('da_1', `${API}/design-assets/da_1/file?variant=display`),
          editorImage('da_2', `${API}/design-assets/da_2/file`),
        ]),
        opts,
      );
      expect(result.ok).toBe(true);
    });

    it('accepts a Fabric version and a plain background colour on fabricJson', () => {
      const data = design([]);
      (data.views.front.fabricJson as Record<string, unknown>).version =
        '7.4.0';
      (data.views.front.fabricJson as Record<string, unknown>).background =
        '#fff';
      expect(inspectDesignContent(data, opts).ok).toBe(true);
    });
  });

  describe('images', () => {
    it('refuses an external image URL', () => {
      refused(
        design([editorImage('da_1', 'https://evil.example.com/pixel.png')]),
        DESIGN_CONTENT_ERROR.IMAGE_EXTERNAL,
      );
    });

    it('refuses our own path served from another host', () => {
      refused(
        design([
          editorImage(
            'da_1',
            'https://evil.example.com/v1/design-assets/da_1/file',
          ),
        ]),
        DESIGN_CONTENT_ERROR.IMAGE_EXTERNAL,
      );
    });

    it.each([
      ['a data: URL', 'data:image/png;base64,AAAA'],
      ['a blob: URL', 'blob:https://api.example.com/abc'],
      ['a protocol-relative URL', '//evil.example.com/a.png'],
      ['a catalogue URL', 'https://cdn.example.com/products/tee.png'],
      ['a relative path', '/v1/design-assets/da_1/file'],
      [
        'credentials in the URL',
        'https://u:p@api.example.com/v1/design-assets/da_1/file',
      ],
      ['a fragment', `${API}/design-assets/da_1/file#x`],
      [
        'an unknown query parameter',
        `${API}/design-assets/da_1/file?variant=original&u=1`,
      ],
      ['an unknown variant', `${API}/design-assets/da_1/file?variant=raw`],
      [
        'a path that only starts like ours',
        `${API}/design-assets/da_1/file/../../x`,
      ],
      ['an empty string', ''],
    ])('refuses %s as an image source', (_label, src) => {
      refused(
        design([editorImage('da_1', src)]),
        DESIGN_CONTENT_ERROR.IMAGE_EXTERNAL,
      );
    });

    it('refuses a source that names another asset than data.designAssetId', () => {
      refused(
        design([
          editorImage(
            'da_1',
            `${API}/design-assets/da_2/file?variant=original`,
          ),
        ]),
        DESIGN_CONTENT_ERROR.IMAGE_EXTERNAL,
      );
    });

    it('refuses an image with no design asset id', () => {
      const image = editorImage('da_1') as Record<string, unknown>;
      image.data = { layerId: 'layer-2' };
      refused(design([image]), DESIGN_CONTENT_ERROR.IMAGE_ASSET_MISSING);
    });

    it('refuses a top-level designAssetId that disagrees with data.designAssetId', () => {
      refused(
        design([{ ...editorImage('da_1'), designAssetId: 'da_2' }]),
        DESIGN_CONTENT_ERROR.IMAGE_ASSET_MISSING,
      );
    });

    it('refuses a background image and a clip path (other places an image could hide)', () => {
      const withBackground = design([]);
      (
        withBackground.views.front.fabricJson as Record<string, unknown>
      ).backgroundImage = editorImage('da_1', 'https://evil.example.com/a.png');
      refused(withBackground, DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED);

      refused(
        design([
          {
            ...editorText,
            clipPath: editorImage('da_1', 'https://evil.example.com/a.png'),
          },
        ]),
        DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED,
      );
    });

    it('refuses a pattern fill, which carries its own image source', () => {
      refused(
        design([
          {
            ...editorText,
            fill: { type: 'pattern', source: 'https://evil.example.com/a.png' },
          },
        ]),
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      );
    });

    it('refuses image filters and shadows', () => {
      refused(
        design([{ ...editorImage('da_1'), filters: [{ type: 'BlendColor' }] }]),
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      );
      refused(
        design([{ ...editorText, shadow: { color: 'red', blur: 5 } }]),
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      );
    });

    it('works with an API URL that has no path prefix', () => {
      const result = inspectDesignContent(
        design([
          editorImage(
            'da_1',
            'http://localhost:3001/design-assets/da_1/file?variant=original',
          ),
        ]),
        { apiPublicUrl: 'http://localhost:3001' },
      );
      expect(result.ok).toBe(true);
    });
  });

  describe('objects and fields', () => {
    it.each([
      'rect',
      'circle',
      'group',
      'path',
      'polygon',
      'svg',
      'video',
      'Triangle',
    ])('refuses an unknown object type (%s)', (type) => {
      refused(
        design([{ ...editorText, type }]),
        DESIGN_CONTENT_ERROR.OBJECT_TYPE_NOT_ALLOWED,
      );
    });

    it('refuses an object with no type, or a type that is not a string', () => {
      refused(
        design([{ text: 'x' }]),
        DESIGN_CONTENT_ERROR.OBJECT_TYPE_NOT_ALLOWED,
      );
      refused(
        design([{ type: 7 }]),
        DESIGN_CONTENT_ERROR.OBJECT_TYPE_NOT_ALLOWED,
      );
      refused(design(['text']), DESIGN_CONTENT_ERROR.STRUCTURE_INVALID);
      refused(design([null]), DESIGN_CONTENT_ERROR.STRUCTURE_INVALID);
    });

    it('refuses a field that is not on the allowlist', () => {
      refused(
        design([{ ...editorText, onclick: 'alert(1)' }]),
        DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED,
      );
      refused(
        design([{ ...editorImage('da_1'), href: 'https://evil.example.com' }]),
        DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED,
      );
    });

    it('does not let a text layer carry image-only fields', () => {
      refused(
        design([{ ...editorText, src: `${API}/design-assets/da_1/file` }]),
        DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED,
      );
    });

    it('refuses unknown keys inside data', () => {
      refused(
        design([
          {
            ...editorText,
            data: { layerId: 'l', url: 'https://evil.example.com' },
          },
        ]),
        DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED,
      );
    });

    it('refuses values of the wrong type on known fields', () => {
      refused(
        design([{ ...editorText, left: '50' }]),
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      );
      refused(
        design([{ ...editorText, text: { a: 1 } }]),
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      );
      refused(
        design([{ ...editorText, visible: 'yes' }]),
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      );
      refused(
        design([{ ...editorText, left: Number.POSITIVE_INFINITY }]),
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      );
    });

    it('refuses text longer than the limit', () => {
      refused(
        design([{ ...editorText, text: 'a'.repeat(5001) }]),
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      );
    });

    it('refuses a design asset id on a text layer, where no ownership check would run', () => {
      refused(
        design([
          { ...editorText, data: { layerId: 'l', designAssetId: 'da_victim' } },
        ]),
        DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED,
      );
      refused(
        design([{ ...editorText, designAssetId: 'da_victim' }]),
        DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED,
      );
    });

    it('refuses a design asset id on a legacy text layer too', () => {
      refused(
        {
          views: {
            front: {
              layers: [
                { type: 'text', content: 'x', designAssetId: 'da_victim' },
              ],
            },
          },
        },
        DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED,
      );
    });

    it('refuses a design asset id hidden at any depth of a text layer styles', () => {
      refused(
        design([
          {
            ...editorText,
            styles: { '0': { '0': { designAssetId: 'da_victim' } } },
          },
        ]),
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      );
      refused(
        design([
          {
            ...editorText,
            styles: [
              { start: 0, end: 1, style: { designAssetId: 'da_victim' } },
            ],
          },
        ]),
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      );
    });

    it('refuses any style property or shape that Fabric does not write', () => {
      refused(
        design([{ ...editorText, styles: { '0': { '0': { url: 'x' } } } }]),
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      );
      refused(
        design([
          { ...editorText, styles: { '0': { '0': { fill: { a: 1 } } } } },
        ]),
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      );
      refused(
        design([{ ...editorText, styles: { '0': 'x' } }]),
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      );
      refused(
        design([{ ...editorText, styles: [{ start: 0, end: 1 }] }]),
        DESIGN_CONTENT_ERROR.FIELD_VALUE_INVALID,
      );
    });

    it('accepts per-character styles in both shapes Fabric writes', () => {
      const style = {
        fill: '#ff0000',
        fontWeight: 'bold',
        fontSize: 20,
        underline: true,
        deltaY: 0,
      };
      expect(
        inspectDesignContent(
          design([
            { ...editorText, styles: { '0': { '0': style, '3': style } } },
          ]),
          opts,
        ).ok,
      ).toBe(true);
      expect(
        inspectDesignContent(
          design([{ ...editorText, styles: [{ start: 0, end: 4, style }] }]),
          opts,
        ).ok,
      ).toBe(true);
    });

    it('refuses a prototype-polluting key without throwing', () => {
      const polluted = JSON.parse('{"__proto__": {"x": 1}, "type": "IText"}');
      refused(design([polluted]), DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED);
    });
  });

  describe('document structure', () => {
    it('refuses unknown top-level and view fields', () => {
      refused(
        { version: 1, views: {}, extra: 1 },
        DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED,
      );
      refused(
        design([], { extra: true }),
        DESIGN_CONTENT_ERROR.FIELD_NOT_ALLOWED,
      );
    });

    it('refuses a wrong shape for views or objects', () => {
      refused({ views: [] }, DESIGN_CONTENT_ERROR.STRUCTURE_INVALID);
      refused({ views: { front: [] } }, DESIGN_CONTENT_ERROR.STRUCTURE_INVALID);
      refused(
        { views: { front: { fabricJson: { objects: {} } } } },
        DESIGN_CONTENT_ERROR.STRUCTURE_INVALID,
      );
      refused(
        { views: { front: { fabricJson: 'x' } } },
        DESIGN_CONTENT_ERROR.STRUCTURE_INVALID,
      );
    });

    it('refuses too many layers in a view', () => {
      refused(
        design(Array.from({ length: 201 }, () => editorText)),
        DESIGN_CONTENT_ERROR.STRUCTURE_INVALID,
      );
    });

    it('still accepts the legacy text layers the moderation reader understands', () => {
      const result = inspectDesignContent(
        {
          version: 1,
          views: {
            front: {
              productViewId: 'pv-1',
              layers: [
                { type: 'text', content: 'Hello World' },
                { type: 'image', designAssetId: 'da-1' },
              ],
            },
          },
        },
        opts,
      );
      expect(result).toEqual({ ok: true, assetIds: new Set(['da-1']) });
    });
  });

  describe('configuration', () => {
    it('fails closed when no API address is configured and a design has an image', () => {
      const result = inspectDesignContent(design([editorImage('da_1')]), {
        apiPublicUrl: undefined,
      });
      expect(result).toMatchObject({
        ok: false,
        code: DESIGN_CONTENT_ERROR.IMAGE_EXTERNAL,
      });
    });

    it('does not need the API address for a design without images', () => {
      expect(
        inspectDesignContent(design([editorText]), { apiPublicUrl: undefined })
          .ok,
      ).toBe(true);
    });
  });
});
