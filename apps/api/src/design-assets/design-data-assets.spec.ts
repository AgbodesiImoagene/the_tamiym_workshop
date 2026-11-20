import { collectDesignAssetIds } from './design-data-assets';

describe('collectDesignAssetIds (TTW-234)', () => {
  it('finds the design assets used by the image layers of every view', () => {
    const designData = {
      version: 1,
      views: {
        front: {
          fabricJson: {
            objects: [
              { type: 'image', data: { designAssetId: 'da_1' } },
              { type: 'i-text', text: 'hello' },
            ],
          },
        },
        back: {
          fabricJson: {
            objects: [{ type: 'image', data: { designAssetId: 'da_2' } }],
          },
        },
      },
    };

    expect(collectDesignAssetIds(designData)).toEqual(
      new Set(['da_1', 'da_2']),
    );
  });

  it('counts an asset once however many layers use it', () => {
    const designData = {
      views: {
        front: {
          fabricJson: {
            objects: [
              { data: { designAssetId: 'da_1' } },
              { data: { designAssetId: 'da_1' } },
            ],
          },
        },
      },
    };

    expect(collectDesignAssetIds(designData)).toEqual(new Set(['da_1']));
  });

  it('ignores the words in text, only the key counts', () => {
    const designData = {
      views: {
        front: {
          fabricJson: {
            objects: [{ type: 'i-text', text: 'designAssetId da_9' }],
          },
        },
      },
    };

    expect(collectDesignAssetIds(designData).size).toBe(0);
  });

  it('ignores ids that are not non-empty strings', () => {
    const designData = {
      objects: [
        { data: { designAssetId: 42 } },
        { data: { designAssetId: '' } },
        { data: { designAssetId: null } },
        { data: { designAssetId: { nested: 'da_5' } } },
      ],
    };

    expect(collectDesignAssetIds(designData).size).toBe(0);
  });

  it.each([null, undefined, 'text', 12, true, []])(
    'returns nothing for %p',
    (value) => {
      expect(collectDesignAssetIds(value).size).toBe(0);
    },
  );

  it('stops at a bounded depth instead of walking a hostile document', () => {
    let deep: Record<string, unknown> = { designAssetId: 'da_deep' };
    for (let i = 0; i < 200; i += 1) deep = { child: deep };

    expect(collectDesignAssetIds(deep).size).toBe(0);
  });
});
