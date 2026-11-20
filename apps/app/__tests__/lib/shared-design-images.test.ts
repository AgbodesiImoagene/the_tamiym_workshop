import { rewriteSharedImageSources, sharedDesignAssetUrl, type FabricJson } from '@/lib/designs';

describe('sharedDesignAssetUrl (TTW-234)', () => {
  it('builds the public, token-scoped path of a customer image', () => {
    expect(sharedDesignAssetUrl('tok_123', 'da_1')).toBe(
      'http://localhost:3001/v1/public/designs/tok_123/assets/da_1/file?variant=original'
    );
  });

  it('encodes the token and the id', () => {
    const url = sharedDesignAssetUrl('a/b', 'c d');
    expect(url).toContain('/public/designs/a%2Fb/assets/c%20d/file');
  });
});

describe('rewriteSharedImageSources (TTW-234)', () => {
  const privateSrc = 'http://localhost:3001/v1/design-assets/da_1/file?variant=original';
  const json: FabricJson = {
    version: '7',
    objects: [
      {
        type: 'image',
        src: privateSrc,
        crossOrigin: 'use-credentials',
        data: { designAssetId: 'da_1' },
      },
      { type: 'image', src: 'https://cdn.example.com/catalogue.webp', crossOrigin: 'anonymous' },
      { type: 'i-text', text: 'hello' },
    ],
  };

  it('points customer images at the share-token endpoint, loaded without cookies', () => {
    const out = rewriteSharedImageSources(json, 'tok_123');

    expect(out?.objects[0]).toMatchObject({
      src: 'http://localhost:3001/v1/public/designs/tok_123/assets/da_1/file?variant=original',
      crossOrigin: 'anonymous',
      data: { designAssetId: 'da_1' },
    });
  });

  it('leaves public images and text alone', () => {
    const out = rewriteSharedImageSources(json, 'tok_123');

    expect(out?.objects[1]).toEqual(json.objects[1]);
    expect(out?.objects[2]).toEqual(json.objects[2]);
  });

  it('does not change the saved design', () => {
    rewriteSharedImageSources(json, 'tok_123');

    expect(json.objects[0].src).toBe(privateSrc);
    expect(json.objects[0].crossOrigin).toBe('use-credentials');
  });

  it('also rewrites images nested in a group, like the server finds them', () => {
    const grouped: FabricJson = {
      objects: [
        {
          type: 'group',
          objects: [{ type: 'image', src: privateSrc, data: { designAssetId: 'da_7' } }],
        },
      ],
    };

    const out = rewriteSharedImageSources(grouped, 'tok_123');
    const inner = (out?.objects[0].objects as Record<string, unknown>[])[0];

    expect(inner.src).toBe(
      'http://localhost:3001/v1/public/designs/tok_123/assets/da_7/file?variant=original'
    );
    expect(inner.crossOrigin).toBe('anonymous');
  });

  it('keeps a missing design as it is', () => {
    expect(rewriteSharedImageSources(null, 'tok_123')).toBeNull();
  });
});
