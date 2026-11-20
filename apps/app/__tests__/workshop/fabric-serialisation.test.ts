/**
 * TTW-102: pins what WorkshopCanvas relies on in the REAL Fabric.js v7 (the other workshop
 * tests use a fake). The layer id lives in `data`, and Fabric only keeps extra properties
 * in `toObject(props)`: `toJSON()` ignores the list and would drop it on save.
 */
import { IText } from 'fabric';

// WorkshopCanvas passes custom property names, which Fabric's typings do not list.
interface Serialisable {
  toObject: (props: string[]) => Record<string, unknown>;
  toJSON: () => Record<string, unknown>;
}

describe('Fabric serialisation of layer data', () => {
  const text = () =>
    new IText('Hello', {
      data: { layerId: 'layer-1', designAssetId: 'a1' },
    }) as unknown as Serialisable;

  it('keeps data when asked through toObject(props)', () => {
    const plain = text().toObject(['designAssetId', 'data']);
    expect(plain.data).toEqual({ layerId: 'layer-1', designAssetId: 'a1' });
    expect(plain.type).toBe('IText');
  });

  it('drops data from toJSON(), which is why toObject is used', () => {
    expect(text().toJSON().data).toBeUndefined();
  });
});
