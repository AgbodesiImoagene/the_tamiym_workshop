import { test, expect } from '../fixtures/test';

const PRODUCT_ID = 'e2e-product-classic-tee';
const VARIANT_ID = 'e2e-variant-tee-navy-m';

/**
 * TTW-014 — inventory availability contract, against the real API (TTW-209).
 *
 * The customer-facing product detail reports `availableQuantity` for a tracked
 * variant as `max(0, stockOnHand - reserved)`, using the same stock row that
 * the variant inventory read returns. Both reads are public.
 *
 * The admin route for inventory is write-only (`PATCH /admin/inventory/variant/:id`),
 * so it is not read here: it would change the stock other specs count. Its
 * response shape is covered by the API integration tests.
 */
test.describe('Inventory availability @smoke', () => {
  test('customer availableQuantity follows stockOnHand - reserved', async ({ api }) => {
    type Inventory = { inventory: { stockOnHand: number; reserved: number } };
    const readInventory = async (): Promise<Inventory['inventory']> => {
      const res = await api.get(`inventory/variant/${VARIANT_ID}`);
      expect(res.status()).toBe(200);
      return ((await res.json()) as Inventory).inventory;
    };

    const before = await readInventory();
    const productRes = await api.get(`products/${PRODUCT_ID}`);
    expect(productRes.status()).toBe(200);
    const product = (await productRes.json()) as {
      variants: { id: string; availableQuantity: number | null; inStock: boolean }[];
    };
    const after = await readInventory();

    const variant = product.variants.find((v) => v.id === VARIANT_ID);
    expect(variant, `variant ${VARIANT_ID} in product detail`).toBeDefined();
    // Another spec may reserve stock between the reads, so accept either side.
    const allowed = [before, after].map((i) => Math.max(0, i.stockOnHand - i.reserved));
    expect(allowed).toContain(variant!.availableQuantity);
    expect(variant!.inStock).toBe(variant!.availableQuantity! > 0);
  });
});
