import { designAssetFileUrl, imageCrossOrigin } from '@/lib/designs';

describe('designAssetFileUrl (TTW-099)', () => {
  it('builds the stable API path of a private customer file, not a storage link', () => {
    expect(designAssetFileUrl('da_1')).toBe(
      'http://localhost:3001/v1/design-assets/da_1/file?variant=original'
    );
  });

  it('can ask for another rendition', () => {
    expect(designAssetFileUrl('da_1', 'thumb')).toBe(
      'http://localhost:3001/v1/design-assets/da_1/file?variant=thumb'
    );
  });

  it('encodes the id', () => {
    expect(designAssetFileUrl('a/b')).toContain('/design-assets/a%2Fb/file');
  });
});

describe('imageCrossOrigin (TTW-099)', () => {
  it('sends credentials for our own private files, which need the session cookie', () => {
    expect(imageCrossOrigin(designAssetFileUrl('da_1'))).toBe('use-credentials');
  });

  it('stays anonymous for public images such as the catalogue', () => {
    expect(imageCrossOrigin('https://cdn.example.com/media/x/display.webp')).toBe('anonymous');
  });

  it('stays anonymous for anything that is not a valid URL', () => {
    expect(imageCrossOrigin('')).toBe('anonymous');
  });
});
