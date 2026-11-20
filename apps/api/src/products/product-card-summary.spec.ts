import { summarizeProductCard } from './product-card-summary';

type Variants = Parameters<typeof summarizeProductCard>[0]['variants'];

function variant(
  color?: { code: string; name: string; sortOrder: number; metadata?: unknown },
  size?: { code: string; name: string; sortOrder: number },
): Variants[number] {
  const optionValues: Variants[number]['optionValues'] = [];
  if (color) {
    optionValues.push({
      option: { code: 'color' },
      optionValue: {
        valueCode: color.code,
        displayName: color.name,
        sortOrder: color.sortOrder,
        metadata: color.metadata ?? null,
      },
    });
  }
  if (size) {
    optionValues.push({
      option: { code: 'SIZE' },
      optionValue: {
        valueCode: size.code,
        displayName: size.name,
        sortOrder: size.sortOrder,
        metadata: null,
      },
    });
  }
  return { optionValues };
}

const RED = {
  code: 'RED',
  name: 'Red',
  sortOrder: 1,
  metadata: { hex: '#ef2557' },
};
const BLUE = {
  code: 'BLUE',
  name: 'Blue',
  sortOrder: 0,
  metadata: { hex: '#1497c6' },
};
const S = { code: 'S', name: 'S', sortOrder: 0 };
const M = { code: 'M', name: 'M', sortOrder: 1 };
const XXXXXL = { code: '5XL', name: '5XL', sortOrder: 5 };

describe('summarizeProductCard (TTW-204)', () => {
  it('lists each colour once, in option-value order, with its hex', () => {
    const summary = summarizeProductCard({
      variants: [variant(RED, S), variant(RED, M), variant(BLUE, S)],
      bulkPricingTiers: [],
    });

    expect(summary.colors).toEqual([
      { code: 'BLUE', name: 'Blue', hex: '#1497c6' },
      { code: 'RED', name: 'Red', hex: '#ef2557' },
    ]);
  });

  it('gives a colour without a valid hex a null hex instead of inventing one', () => {
    const summary = summarizeProductCard({
      variants: [
        variant({ code: 'A', name: 'No metadata', sortOrder: 0 }),
        variant({
          code: 'B',
          name: 'Bad hex',
          sortOrder: 1,
          metadata: { hex: 'red' },
        }),
        variant({
          code: 'C',
          name: 'Not a string',
          sortOrder: 2,
          metadata: { hex: 12 },
        }),
      ],
      bulkPricingTiers: [],
    });

    expect(summary.colors.map((color) => color.hex)).toEqual([
      null,
      null,
      null,
    ]);
  });

  it('writes the size range from the first to the last size', () => {
    const summary = summarizeProductCard({
      variants: [variant(RED, XXXXXL), variant(RED, S), variant(RED, M)],
      bulkPricingTiers: [],
    });

    expect(summary.sizeRange).toBe('S-5XL');
  });

  it('keeps a stable order when sizes share the same sort order', () => {
    const a = { code: 'A', name: 'A', sortOrder: 0 };
    const b = { code: 'B', name: 'B', sortOrder: 0 };

    const first = summarizeProductCard({
      variants: [variant(RED, b), variant(RED, a)],
      bulkPricingTiers: [],
    });
    const second = summarizeProductCard({
      variants: [variant(RED, a), variant(RED, b)],
      bulkPricingTiers: [],
    });

    expect(first.sizeRange).toBe('A-B');
    expect(second.sizeRange).toBe('A-B');
  });

  it('writes a single size alone', () => {
    const summary = summarizeProductCard({
      variants: [variant(RED, M), variant(BLUE, M)],
      bulkPricingTiers: [],
    });

    expect(summary.sizeRange).toBe('M');
  });

  it('returns no colours, no size range and no tier for a product without variants or tiers', () => {
    expect(
      summarizeProductCard({ variants: [], bulkPricingTiers: [] }),
    ).toEqual({
      colors: [],
      sizeRange: null,
      bulkTier: null,
    });
  });

  it('ignores variants that have neither a colour nor a size option', () => {
    const summary = summarizeProductCard({
      variants: [variant()],
      bulkPricingTiers: [],
    });

    expect(summary.colors).toEqual([]);
    expect(summary.sizeRange).toBeNull();
  });

  it('picks the tier with the lowest unit price, as a number', () => {
    const summary = summarizeProductCard({
      variants: [],
      bulkPricingTiers: [
        { minQuantity: 10, pricePerUnit: '4500.00' },
        { minQuantity: 30, pricePerUnit: '3800.50' },
        { minQuantity: 20, pricePerUnit: '4000.00' },
      ],
    });

    expect(summary.bulkTier).toEqual({ minQuantity: 30, pricePerUnit: 3800.5 });
  });
});
