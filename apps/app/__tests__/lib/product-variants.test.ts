/**
 * TTW-092: the product page offers colours and sizes built from the variants the API
 * returns, and only variants that can really be bought are selectable.
 */
import { groupVariantsByColor, headlinePrice, imagesForColor } from '@/lib/product-variants';
import type { DashboardProductDetail } from '@/lib/products';

function variant(
  id: string,
  color: [string, string] | null,
  size: [string, string] | null,
  extra: Partial<DashboardProductDetail['variants'][number]> = {}
): DashboardProductDetail['variants'][number] {
  const optionValues = [
    ...(color
      ? [
          {
            option: { code: 'color', name: 'Colour' },
            optionValue: { valueCode: color[0], displayName: color[1] },
          },
        ]
      : []),
    ...(size
      ? [
          {
            option: { code: 'size', name: 'Size' },
            optionValue: { valueCode: size[0], displayName: size[1] },
          },
        ]
      : []),
  ];
  return {
    id,
    name: `${color?.[1] ?? ''} ${size?.[1] ?? ''}`.trim() || 'Default',
    sku: `SKU-${id}`,
    isAvailable: true,
    inStock: true,
    availableQuantity: null,
    resolvedPrice: 5000,
    resolvedCompareAt: null,
    resolvedCurrency: 'NGN',
    optionValues,
    ...extra,
  };
}

function product(
  variants: DashboardProductDetail['variants'],
  images: DashboardProductDetail['images'] = []
): DashboardProductDetail {
  return {
    id: 'p1',
    name: 'Classic Tee',
    slug: 'classic-tee',
    prices: [],
    productImageRoles: [],
    resolvedBasePrice: 4500,
    resolvedCurrency: 'NGN',
    variants,
    images,
  };
}

describe('groupVariantsByColor', () => {
  it('groups sizes under each colour, in the order the API lists them', () => {
    const groups = groupVariantsByColor(
      product([
        variant('v1', ['BLACK', 'Black'], ['S', 'S']),
        variant('v2', ['BLACK', 'Black'], ['M', 'M']),
        variant('v3', ['WHITE', 'White'], ['S', 'S']),
      ])
    );

    expect(groups.map((group) => group.label)).toEqual(['Black', 'White']);
    expect(groups[0].choices.map((choice) => [choice.variantId, choice.sizeLabel])).toEqual([
      ['v1', 'S'],
      ['v2', 'M'],
    ]);
    expect(groups[1].choices.map((choice) => choice.variantId)).toEqual(['v3']);
  });

  it('marks unavailable and out-of-stock variants as not purchasable', () => {
    const [group] = groupVariantsByColor(
      product([
        variant('v1', ['BLACK', 'Black'], ['S', 'S']),
        variant('v2', ['BLACK', 'Black'], ['M', 'M'], { isAvailable: false }),
        variant('v3', ['BLACK', 'Black'], ['L', 'L'], { inStock: false, availableQuantity: 0 }),
      ])
    );

    expect(group.choices.map((choice) => choice.purchasable)).toEqual([true, false, false]);
  });

  it('caps the quantity at the tracked stock and leaves untracked stock uncapped', () => {
    const [group] = groupVariantsByColor(
      product([
        variant('v1', ['BLACK', 'Black'], ['S', 'S'], { availableQuantity: 7 }),
        variant('v2', ['BLACK', 'Black'], ['M', 'M'], { availableQuantity: null }),
      ])
    );

    expect(group.choices.map((choice) => choice.maxQuantity)).toEqual([7, null]);
  });

  it('prices each choice from the variant, then the product base price', () => {
    const [group] = groupVariantsByColor(
      product([
        variant('v1', ['BLACK', 'Black'], ['S', 'S'], { resolvedPrice: 6000 }),
        variant('v2', ['BLACK', 'Black'], ['M', 'M'], { resolvedPrice: null }),
      ])
    );

    expect(group.choices.map((choice) => choice.unitPrice)).toEqual([6000, 4500]);
    expect(group.choices[0].currency).toBe('NGN');
  });

  it('keeps a readable summary for the cart line', () => {
    const [group] = groupVariantsByColor(product([variant('v1', ['BLACK', 'Black'], ['S', 'S'])]));

    expect(group.choices[0].optionSummary).toBe('Colour: Black • Size: S');
  });

  it('falls back to one default colour group when the product has no colour option', () => {
    const groups = groupVariantsByColor(
      product([variant('v1', null, ['S', 'S']), variant('v2', null, ['M', 'M'])])
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].label).toBe('Default');
    expect(groups[0].choices.map((choice) => choice.sizeLabel)).toEqual(['S', 'M']);
  });

  it('returns no groups for a product without variants', () => {
    expect(groupVariantsByColor(product([]))).toEqual([]);
  });
});

describe('imagesForColor', () => {
  const imageList: DashboardProductDetail['images'] = [
    { id: 'i1', variantId: 'v1', url: '/black-front.png', altText: 'Black front' },
    { id: 'i2', variantId: 'v3', url: '/white-front.png', altText: null },
    { id: 'i3', variantId: null, url: '/generic.png', altText: null },
  ];

  it('returns the images of the chosen colour first', () => {
    const detail = product(
      [
        variant('v1', ['BLACK', 'Black'], ['S', 'S']),
        variant('v3', ['WHITE', 'White'], ['S', 'S']),
      ],
      imageList
    );
    const [black, white] = groupVariantsByColor(detail);

    expect(imagesForColor(detail, black).map((image) => image.url)).toEqual(['/black-front.png']);
    expect(imagesForColor(detail, white).map((image) => image.url)).toEqual(['/white-front.png']);
  });

  it('falls back to images that belong to no variant when the colour has none', () => {
    const detail = product([variant('v9', ['RED', 'Red'], ['S', 'S'])], imageList);
    const [red] = groupVariantsByColor(detail);

    expect(imagesForColor(detail, red).map((image) => image.url)).toEqual(['/generic.png']);
  });

  it('falls back to the product main image (the one the list shows) when no gallery image fits', () => {
    const detail: DashboardProductDetail = {
      ...product(
        [variant('v9', ['RED', 'Red'], ['S', 'S'])],
        [{ id: 'i1', variantId: 'v1', url: '/other-colour.png', altText: null }]
      ),
      productImageRoles: [{ image: { url: '/main.png', altText: 'Main' } }],
    };
    const [red] = groupVariantsByColor(detail);

    expect(imagesForColor(detail, red).map((image) => image.url)).toEqual(['/main.png']);
  });

  it('returns nothing when the product has no usable image', () => {
    const detail = product([variant('v9', ['RED', 'Red'], ['S', 'S'])]);
    const [red] = groupVariantsByColor(detail);

    expect(imagesForColor(detail, red)).toEqual([]);
  });
});

describe('colour swatches (TTW-268)', () => {
  function withMetadata(metadata: unknown) {
    const base = variant('v1', ['NAVY', 'Navy'], ['S', 'S']);
    return {
      ...base,
      optionValues: base.optionValues.map((entry) =>
        entry.option.code === 'color'
          ? { ...entry, optionValue: { ...entry.optionValue, metadata } }
          : entry
      ),
    };
  }

  it.each(['#abc', '#1e39d2', '#1e39d2ff'])(
    'reads the hex %s of the colour option value',
    (hex) => {
      const [group] = groupVariantsByColor(product([withMetadata({ hex })]));

      expect(group).toMatchObject({ isColor: true, hex });
    }
  );

  it.each([
    ['no metadata', undefined],
    ['null metadata', null],
    ['no hex', {}],
    ['a hex that is not a string', { hex: 12 }],
    ['a value that is not a hex colour', { hex: 'url(https://example.com/x.png)' }],
  ])('has no hex with %s', (_label, metadata) => {
    const [group] = groupVariantsByColor(product([withMetadata(metadata)]));

    expect(group).toMatchObject({ isColor: true, hex: null });
  });

  it('marks the default group as not being a colour', () => {
    const [group] = groupVariantsByColor(product([variant('v1', null, ['S', 'S'])]));

    expect(group).toMatchObject({ isColor: false, hex: null });
  });
});

describe('headlinePrice (TTW-268)', () => {
  const black: [string, string] = ['BLACK', 'Black'];
  const priced = (id: string, extra: Partial<DashboardProductDetail['variants'][number]>) =>
    variant(id, black, [id, id], extra);

  function priceOf(detail: DashboardProductDetail) {
    return headlinePrice(detail, groupVariantsByColor(detail)[0]);
  }

  it('gives the single price of the sizes of a colour', () => {
    expect(priceOf(product([priced('S', {}), priced('M', {})]))).toEqual({
      amount: 5000,
      compareAt: null,
      currency: 'NGN',
      from: false,
    });
  });

  it('gives the lowest price, as "from", with the compare-at price of that size', () => {
    const detail = product([
      priced('S', { resolvedPrice: 7000, resolvedCompareAt: 9000 }),
      priced('M', { resolvedPrice: 6000, resolvedCompareAt: 8000 }),
    ]);

    expect(priceOf(detail)).toMatchObject({ amount: 6000, compareAt: 8000, from: true });
  });

  it('strikes a former price only when every size at the lowest price has one', () => {
    const discounted = priced('S', { resolvedCompareAt: 8000 });
    const full = priced('M', {});
    expect(priceOf(product([discounted, full]))?.compareAt).toBeNull();
    expect(priceOf(product([full, discounted]))?.compareAt).toBeNull();

    const smaller = priced('M', { resolvedCompareAt: 7000 });
    expect(priceOf(product([discounted, smaller]))?.compareAt).toBe(7000);
    expect(priceOf(product([smaller, discounted]))?.compareAt).toBe(7000);
  });

  it('ignores a compare-at price that is not higher than the price', () => {
    expect(priceOf(product([priced('S', { resolvedCompareAt: 5000 })]))?.compareAt).toBeNull();
    expect(priceOf(product([priced('S', { resolvedCompareAt: 4000 })]))?.compareAt).toBeNull();
  });

  it('compares decimal strings from the API as numbers', () => {
    const detail = product([
      priced('S', {
        resolvedPrice: '10000.00' as unknown as number,
        resolvedCompareAt: '12000.00' as unknown as number,
      }),
      priced('M', { resolvedPrice: '9000.00' as unknown as number }),
    ]);

    expect(priceOf(detail)).toMatchObject({ amount: 9000, from: true });
  });

  it('prices from the sizes that can be bought, else from all of them', () => {
    const soldOutCheaper = product([
      priced('S', { resolvedPrice: 3000, inStock: false, availableQuantity: 0 }),
      priced('M', { resolvedPrice: 6000 }),
    ]);
    expect(priceOf(soldOutCheaper)).toMatchObject({ amount: 6000, from: false });

    const allSoldOut = product([
      priced('S', { resolvedPrice: 3000, isAvailable: false }),
      priced('M', { resolvedPrice: 6000, isAvailable: false }),
    ]);
    expect(priceOf(allSoldOut)).toMatchObject({ amount: 3000, from: true });
  });

  it('uses the product base price and compare-at when there is no variant', () => {
    const detail = { ...product([]), resolvedBaseCompareAt: 5500 };

    expect(headlinePrice(detail, undefined)).toEqual({
      amount: 4500,
      compareAt: 5500,
      currency: 'NGN',
      from: false,
    });
  });

  it('gives nothing, never zero, when no price exists', () => {
    const detail = {
      ...product([priced('S', { resolvedPrice: null })]),
      resolvedBasePrice: null,
    };

    expect(priceOf(detail)).toBeNull();
    expect(headlinePrice({ ...detail, variants: [] }, undefined)).toBeNull();
  });
});
