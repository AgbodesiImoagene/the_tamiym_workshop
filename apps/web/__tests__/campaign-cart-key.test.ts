/**
 * TTW-037 review finding 6: when the API refuses a key that was already used with
 * other content, the fundraiser cart starts a new revision of the same lines.
 */
import { addSelectionToCart, withNewIdempotencyKey } from '../lib/campaign-cart';

const selection = {
  campaignId: 'camp-1',
  campaignProductId: 'cp-1',
  productId: 'prod-1',
  variantId: 'var-1',
  designId: 'des-1',
  quantity: 2,
};

describe('withNewIdempotencyKey', () => {
  it('keeps the lines and campaign, changes the key and drops the pending order', () => {
    const cart = { ...addSelectionToCart(null, selection), pendingOrderId: 'order-1' };

    const next = withNewIdempotencyKey(cart);

    expect(next.idempotencyKey).not.toBe(cart.idempotencyKey);
    expect(next.idempotencyKey).toEqual(expect.any(String));
    expect(next.lines).toEqual(cart.lines);
    expect(next.campaignId).toBe('camp-1');
    expect(next.pendingOrderId).toBeNull();
  });
});
