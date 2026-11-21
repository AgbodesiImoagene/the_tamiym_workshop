/** @jest-environment jsdom */
import { FabricImage } from 'fabric';
import { designAssetFileUrl, imageCrossOrigin } from '@/lib/designs';

/**
 * TTW-100: the API only accepts an image whose `src` is exactly the stable path of its
 * design asset. This pins what Fabric really writes for such an image, the same call the
 * canvas uses to save (`toObject(['designAssetId', 'data'])`), so a Fabric upgrade that
 * changes the saved form fails here instead of refusing every design with an image.
 */
describe('a private customer image as Fabric saves it (TTW-100)', () => {
  const assetId = 'cmwpjo8xu0002uygucij9xgto';
  const src = designAssetFileUrl(assetId);

  function savedImage() {
    const element = document.createElement('img');
    element.src = src;
    element.crossOrigin = imageCrossOrigin(src);
    const image = new FabricImage(element, {
      data: { designAssetId: assetId, layerId: 'layer-1' },
    } as never);
    return (
      image as unknown as { toObject: (props: string[]) => Record<string, unknown> }
    ).toObject(['designAssetId', 'data']);
  }

  it('keeps the exact API path in src and the asset id in data', () => {
    const saved = savedImage();
    expect(saved.src).toBe(src);
    expect(saved.data).toEqual({ designAssetId: assetId, layerId: 'layer-1' });
  });

  it('writes crossOrigin as use-credentials, an empty filter list and no shadow', () => {
    const saved = savedImage();
    expect(saved.crossOrigin).toBe('use-credentials');
    expect(saved.filters).toEqual([]);
    expect(saved.shadow).toBeNull();
  });

  it('writes only keys that the server allowlist knows', () => {
    // Mirror of the allowlist in apps/api/src/designs/design-content.validator.ts.
    const allowed = new Set([
      'type',
      'version',
      'originX',
      'originY',
      'left',
      'top',
      'width',
      'height',
      'fill',
      'stroke',
      'strokeWidth',
      'strokeDashArray',
      'strokeLineCap',
      'strokeDashOffset',
      'strokeLineJoin',
      'strokeUniform',
      'strokeMiterLimit',
      'scaleX',
      'scaleY',
      'angle',
      'flipX',
      'flipY',
      'opacity',
      'shadow',
      'visible',
      'backgroundColor',
      'fillRule',
      'paintFirst',
      'globalCompositeOperation',
      'skewX',
      'skewY',
      'data',
      'designAssetId',
      'cropX',
      'cropY',
      'filters',
      'selectable',
      'src',
      'crossOrigin',
    ]);
    const unknown = Object.keys(savedImage()).filter((key) => !allowed.has(key));
    expect(unknown).toEqual([]);
  });
});
