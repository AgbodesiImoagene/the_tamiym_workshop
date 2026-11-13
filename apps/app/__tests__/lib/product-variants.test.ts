/**
 * TTW-092: the product page offers colours and sizes built from the variants the API
 * returns, and only variants that can really be bought are selectable.
 */
import { groupVariantsByColor, imagesForColor } from '@/lib/product-variants';
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

  it('returns nothing when the product has no usable image', () => {
    const detail = product([variant('v9', ['RED', 'Red'], ['S', 'S'])]);
    const [red] = groupVariantsByColor(detail);

    expect(imagesForColor(detail, red)).toEqual([]);
  });
});
