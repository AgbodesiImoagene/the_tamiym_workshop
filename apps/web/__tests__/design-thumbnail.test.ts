import { designThumbnailSrc } from '@/lib/design-thumbnail';

describe('designThumbnailSrc (TTW-237)', () => {
  it('turns the stable API path of a design thumbnail into a full API address', () => {
    expect(designThumbnailSrc('/designs/d_1/thumbnail')).toBe(
      'http://localhost:3001/v1/designs/d_1/thumbnail'
    );
  });

  it('leaves an absolute https address untouched (seeded placeholder images)', () => {
    expect(designThumbnailSrc('https://placehold.co/640x640')).toBe('https://placehold.co/640x640');
  });

  it('returns null when there is no thumbnail', () => {
    expect(designThumbnailSrc(null)).toBeNull();
    expect(designThumbnailSrc(undefined)).toBeNull();
    expect(designThumbnailSrc('   ')).toBeNull();
  });

  it('refuses a protocol-relative or script address', () => {
    expect(designThumbnailSrc('//evil.example.com/a.png')).toBeNull();
    expect(designThumbnailSrc('javascript:alert(1)')).toBeNull();
  });
});
