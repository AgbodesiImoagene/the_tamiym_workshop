import assert from 'node:assert/strict';
import test from 'node:test';
import type { PublicFundraiserProduct } from './fundraisers';
import { applyOptionValueSelection, isOptionValueSelectable } from './fundraiser-selection';

const sparseProduct: PublicFundraiserProduct = {
  campaignProductId: 'cp1',
  productId: 'p1',
  product: { id: 'p1', name: 'Tee', slug: 'tee' },
  design: { id: 'd1', name: 'Design', thumbnailUrl: null },
  baseAmountMinor: 500000,
  currency: 'NGN',
  priceDisclosure: 'before discounts, shipping and VAT',
  options: [
    {
      id: 'color',
      name: 'Colour',
      code: 'color',
      sortOrder: 0,
      values: [
        {
          id: 'black',
          valueCode: 'black',
          displayName: 'Black',
          sortOrder: 0,
          metadata: null,
        },
        {
          id: 'white',
          valueCode: 'white',
          displayName: 'White',
          sortOrder: 1,
          metadata: null,
        },
      ],
    },
    {
      id: 'size',
      name: 'Size',
      code: 'size',
      sortOrder: 1,
      values: [
        { id: 'm', valueCode: 'm', displayName: 'M', sortOrder: 0, metadata: null },
        { id: 'l', valueCode: 'l', displayName: 'L', sortOrder: 1, metadata: null },
      ],
    },
  ],
  variants: [
    {
      id: 'v-black-m',
      optionValueIds: ['black', 'm'],
      optionValueCodes: ['black', 'm'],
      available: true,
      unitAmountMinor: 500000,
      currency: 'NGN',
    },
    {
      id: 'v-white-l',
      optionValueIds: ['white', 'l'],
      optionValueCodes: ['white', 'l'],
      available: true,
      unitAmountMinor: 520000,
      currency: 'NGN',
    },
    {
      id: 'v-white-m',
      optionValueIds: ['white', 'm'],
      optionValueCodes: ['white', 'm'],
      available: false,
      unitAmountMinor: 520000,
      currency: 'NGN',
    },
  ],
};

test('sparse matrix: white remains selectable from black/M', () => {
  assert.equal(isOptionValueSelectable(sparseProduct, 'white'), true);
  assert.equal(isOptionValueSelectable(sparseProduct, 'l'), true);
});

test('sparse matrix: selecting white from black/M resets size to L', () => {
  const next = applyOptionValueSelection(
    sparseProduct,
    { color: 'black', size: 'm' },
    'color',
    'white'
  );
  assert.deepEqual(next, { color: 'white', size: 'l' });
});

test('value only on unavailable variant is not selectable', () => {
  const product: PublicFundraiserProduct = {
    ...sparseProduct,
    variants: [
      {
        id: 'v-black-m',
        optionValueIds: ['black', 'm'],
        optionValueCodes: ['black', 'm'],
        available: true,
        unitAmountMinor: 500000,
        currency: 'NGN',
      },
      {
        id: 'v-white-l',
        optionValueIds: ['white', 'l'],
        optionValueCodes: ['white', 'l'],
        available: false,
        unitAmountMinor: 520000,
        currency: 'NGN',
      },
    ],
  };
  assert.equal(isOptionValueSelectable(product, 'white'), false);
});
