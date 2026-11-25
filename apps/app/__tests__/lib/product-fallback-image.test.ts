/**
 * TTW-253: a product without a photo shows a placeholder. The list card and the product
 * page must show the same one, so it is picked from the product, not from its list position.
 */
import { customerAssets } from '@/lib/assets';
import { productFallbackImage } from '@/lib/assets';

describe('productFallbackImage', () => {
  it('returns the same placeholder every time for the same product', () => {
    expect(productFallbackImage('cmwsdnnow0002kzgo7u38lwbo')).toBe(
      productFallbackImage('cmwsdnnow0002kzgo7u38lwbo')
    );
  });

  it('always returns one of the known placeholders', () => {
    for (const id of ['a', 'b', 'cmwsdnnow0002kzgo7u38lwbo', '', '123']) {
      expect(customerAssets.productFallbacks).toContain(productFallbackImage(id));
    }
  });

  it('spreads different products over several placeholders', () => {
    const ids = Array.from({ length: 30 }, (_, index) => `product-${index}`);
    const used = new Set(ids.map(productFallbackImage));
    expect(used.size).toBeGreaterThan(1);
  });
});
