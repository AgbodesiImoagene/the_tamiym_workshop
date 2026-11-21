import {
  DESIGN_SNAPSHOT_VERSION,
  buildDesignSnapshot,
  toAdminPrintFiles,
} from './order-item-design-snapshot';

const NOW = new Date('2026-11-21T10:00:00.000Z');

const productViews = [
  {
    id: 'pv-front',
    key: 'front',
    displayName: 'Front',
    sortOrder: 0,
    printArea: { x: 0.2, y: 0.25, width: 0.6, height: 0.5 },
  },
  {
    id: 'pv-back',
    key: 'back',
    displayName: 'Back',
    sortOrder: 1,
    printArea: null,
  },
];

const imageLayer = (assetId: string, extra: Record<string, unknown> = {}) => ({
  type: 'Image',
  left: 10,
  top: 20,
  width: 400,
  height: 300,
  scaleX: 0.5,
  scaleY: 0.5,
  angle: 15,
  flipX: false,
  flipY: true,
  originX: 'left',
  originY: 'top',
  src: `https://api.example.com/v1/design-assets/${assetId}/file`,
  crossOrigin: 'use-credentials',
  data: { designAssetId: assetId, layerId: 'l-1' },
  ...extra,
});

const textLayer = (extra: Record<string, unknown> = {}) => ({
  type: 'Textbox',
  text: 'Team Tamiym',
  fontFamily: 'Inter',
  fontSize: 40,
  fontWeight: 'bold',
  fill: '#112233',
  left: 50,
  top: 60,
  width: 200,
  height: 48,
  scaleX: 1,
  scaleY: 1,
  angle: 0,
  textAlign: 'center',
  ...extra,
});

const design = (views: Record<string, unknown>) => ({
  id: 'design-1',
  name: 'My shirt',
  productId: 'product-1',
  designData: { version: 1, productId: 'product-1', views },
});

describe('buildDesignSnapshot (TTW-101)', () => {
  it('records the design, its used views, their print areas and their layers', () => {
    const snapshot = buildDesignSnapshot(
      design({
        front: {
          productViewId: 'pv-front',
          isUsed: true,
          layerCount: 2,
          fabricJson: { objects: [imageLayer('da-1'), textLayer()] },
        },
      }),
      productViews,
      NOW,
    );

    expect(snapshot).toEqual({
      version: DESIGN_SNAPSHOT_VERSION,
      capturedAt: '2026-11-21T10:00:00.000Z',
      designId: 'design-1',
      designName: 'My shirt',
      productId: 'product-1',
      views: [
        {
          key: 'front',
          displayName: 'Front',
          sortOrder: 0,
          productViewId: 'pv-front',
          printArea: { x: 0.2, y: 0.25, width: 0.6, height: 0.5 },
          layers: [
            {
              kind: 'image',
              designAssetId: 'da-1',
              left: 10,
              top: 20,
              width: 400,
              height: 300,
              scaleX: 0.5,
              scaleY: 0.5,
              angle: 15,
              flipX: false,
              flipY: true,
              originX: 'left',
              originY: 'top',
            },
            {
              kind: 'text',
              text: 'Team Tamiym',
              fontFamily: 'Inter',
              fontSize: 40,
              fontWeight: 'bold',
              fill: '#112233',
              textAlign: 'center',
              left: 50,
              top: 60,
              width: 200,
              height: 48,
              scaleX: 1,
              scaleY: 1,
              angle: 0,
            },
          ],
        },
      ],
    });
  });

  it('keeps every side that has layers, in the product order, and skips empty ones', () => {
    const snapshot = buildDesignSnapshot(
      design({
        back: {
          productViewId: 'pv-back',
          fabricJson: { objects: [textLayer({ text: 'Back' })] },
        },
        front: {
          productViewId: 'pv-front',
          fabricJson: { objects: [textLayer({ text: 'Front' })] },
        },
        sleeve: { productViewId: 'pv-sleeve', fabricJson: { objects: [] } },
      }),
      productViews,
      NOW,
    );

    expect(snapshot.views.map((v) => v.key)).toEqual(['front', 'back']);
    expect(snapshot.views[1].printArea).toBeNull();
  });

  it('copies nothing but an allowlist from a layer (no url, data blob or unknown field)', () => {
    const snapshot = buildDesignSnapshot(
      design({
        front: {
          productViewId: 'pv-front',
          fabricJson: {
            objects: [
              imageLayer('da-1', { evil: '<script>', shadow: null }),
              textLayer({ styles: { 0: { 0: { fill: 'red' } } } }),
            ],
          },
        },
      }),
      productViews,
      NOW,
    );

    const serialised = JSON.stringify(snapshot);
    expect(serialised).not.toContain('script');
    expect(serialised).not.toContain('https://');
    expect(serialised).not.toContain('crossOrigin');
    expect(serialised).not.toContain('styles');
  });

  it('drops an image layer that names no design asset rather than invent one', () => {
    const snapshot = buildDesignSnapshot(
      design({
        front: {
          productViewId: 'pv-front',
          fabricJson: { objects: [imageLayer('da-1', { data: {} })] },
        },
      }),
      productViews,
      NOW,
    );
    expect(snapshot.views).toEqual([]);
  });

  it('reads the legacy `layers` list when a view has no fabricJson', () => {
    const snapshot = buildDesignSnapshot(
      design({
        front: { productViewId: 'pv-front', layers: [textLayer()] },
      }),
      productViews,
      NOW,
    );
    expect(snapshot.views[0].layers).toHaveLength(1);
  });

  it('gives an empty snapshot for an empty design', () => {
    const snapshot = buildDesignSnapshot(
      { id: 'd', name: 'Blank', productId: 'p', designData: {} },
      productViews,
      NOW,
    );
    expect(snapshot.views).toEqual([]);
  });

  it('is a copy: later changes to the live design data do not reach it', () => {
    const live = design({
      front: {
        productViewId: 'pv-front',
        fabricJson: { objects: [textLayer({ text: 'Before' })] },
      },
    });
    const snapshot = buildDesignSnapshot(live, productViews, NOW);

    (
      (live.designData.views.front as { fabricJson: { objects: unknown[] } })
        .fabricJson.objects[0] as { text: string }
    ).text = 'After';

    expect(JSON.stringify(snapshot)).toContain('Before');
    expect(JSON.stringify(snapshot)).not.toContain('After');
  });
});

describe('toAdminPrintFiles (TTW-101)', () => {
  const snapshot = buildDesignSnapshot(
    design({
      front: {
        productViewId: 'pv-front',
        fabricJson: { objects: [imageLayer('da-1'), textLayer()] },
      },
    }),
    productViews,
    NOW,
  );

  it('adds the file facts and the two admin paths to each image layer', () => {
    const files = toAdminPrintFiles(
      snapshot,
      new Map([
        [
          'da-1',
          {
            mimeType: 'image/png',
            bytes: 123456,
            width: 3000,
            height: 2000,
            status: 'READY',
          },
        ],
      ]),
    );

    expect(files).toMatchObject({
      designName: 'My shirt',
      capturedAt: '2026-11-21T10:00:00.000Z',
    });
    const [image, text] = files!.views[0].layers;
    expect(image).toMatchObject({
      kind: 'image',
      designAssetId: 'da-1',
      previewPath: '/design-assets/da-1/file?variant=display',
      originalLinkPath: '/design-assets/da-1/link?variant=original',
      file: {
        mimeType: 'image/png',
        bytes: 123456,
        width: 3000,
        height: 2000,
        status: 'READY',
      },
    });
    expect(text).toMatchObject({ kind: 'text', text: 'Team Tamiym' });
    expect(text).not.toHaveProperty('previewPath');
  });

  it('says so when the file is gone instead of failing the whole order page', () => {
    const files = toAdminPrintFiles(snapshot, new Map());
    expect(files!.views[0].layers[0]).toMatchObject({
      kind: 'image',
      file: null,
    });
  });

  it('is null for an item without a snapshot, an unknown version or junk', () => {
    expect(toAdminPrintFiles(null, new Map())).toBeNull();
    expect(toAdminPrintFiles(undefined, new Map())).toBeNull();
    expect(toAdminPrintFiles({ version: 99 }, new Map())).toBeNull();
    expect(toAdminPrintFiles('nope', new Map())).toBeNull();
  });
});
