/**
 * TTW-037: versioned standard cart with a stable idempotency key per cart revision
 * and design-aware line identity (client answer Q6: several saved designs per cart).
 */
import {
  CUSTOMER_CART_STORAGE_KEY,
  LEGACY_CUSTOMER_CART_STORAGE_KEY,
  addCartItem,
  cartLineKey,
  clearCartIfPendingOrder,
  getCart,
  removeCartItem,
  rotateCartIdempotencyKey,
  setCartPendingOrder,
  updateCartItemQuantity,
  type CartItem,
} from '@/lib/cart-store';

function line(overrides: Partial<CartItem> = {}): CartItem {
  return {
    productId: 'prod-1',
    productName: 'Classic Tee',
    variantId: 'var-1',
    variantName: 'Small / Red',
    optionSummary: 'Size: Small',
    quantity: 1,
    unitPrice: 5000,
    currency: 'NGN',
    imageUrl: null,
    ...overrides,
  };
}

function requireCart() {
  const cart = getCart();
  if (!cart) throw new Error('expected a cart');
  return cart;
}

beforeEach(() => {
  window.localStorage.clear();
});

describe('cart line identity', () => {
  it('keeps two designs on the same variant as two lines', () => {
    addCartItem(line({ designId: 'des-1' }));
    addCartItem(line({ designId: 'des-2' }));

    const cart = requireCart();
    expect(cart.lines).toHaveLength(2);
    expect(cart.lines.map((item) => item.designId)).toEqual(['des-1', 'des-2']);
  });

  it('merges the same variant and design into one line', () => {
    addCartItem(line({ designId: 'des-1', quantity: 2 }));
    addCartItem(line({ designId: 'des-1', quantity: 3 }));

    const cart = requireCart();
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].quantity).toBe(5);
  });

  it('updates and removes only the addressed design line', () => {
    addCartItem(line({ designId: 'des-1' }));
    addCartItem(line({ designId: 'des-2' }));

    updateCartItemQuantity(cartLineKey({ variantId: 'var-1', designId: 'des-2' }), 4);
    expect(requireCart().lines.map((item) => item.quantity)).toEqual([1, 4]);

    removeCartItem(cartLineKey({ variantId: 'var-1', designId: 'des-1' }));
    expect(requireCart().lines.map((item) => item.designId)).toEqual(['des-2']);
  });
});

describe('cart idempotency key', () => {
  it('stays the same across reads of an unchanged cart', () => {
    addCartItem(line());
    const first = requireCart().idempotencyKey;

    expect(first).toEqual(expect.any(String));
    expect(requireCart().idempotencyKey).toBe(first);
    expect(requireCart().idempotencyKey).toBe(first);
  });

  it('changes on add, quantity update and remove, and clears the pending order', () => {
    addCartItem(line());
    const keys = [requireCart().idempotencyKey];

    setCartPendingOrder('order-1');
    addCartItem(line({ variantId: 'var-2' }));
    keys.push(requireCart().idempotencyKey);
    expect(requireCart().pendingOrderId).toBeNull();

    setCartPendingOrder('order-2');
    updateCartItemQuantity(cartLineKey({ variantId: 'var-2' }), 3);
    keys.push(requireCart().idempotencyKey);
    expect(requireCart().pendingOrderId).toBeNull();

    setCartPendingOrder('order-3');
    removeCartItem(cartLineKey({ variantId: 'var-2' }));
    keys.push(requireCart().idempotencyKey);
    expect(requireCart().pendingOrderId).toBeNull();

    expect(new Set(keys).size).toBe(4);
  });

  it('records the pending order without changing the key', () => {
    addCartItem(line());
    const key = requireCart().idempotencyKey;

    setCartPendingOrder('order-1');

    expect(requireCart().pendingOrderId).toBe('order-1');
    expect(requireCart().idempotencyKey).toBe(key);
  });

  it('ignores a pending order meant for a previous cart revision', () => {
    addCartItem(line());
    const oldKey = requireCart().idempotencyKey;
    addCartItem(line({ variantId: 'var-2' }));

    setCartPendingOrder('order-1', oldKey);

    expect(requireCart().pendingOrderId).toBeNull();
  });

  it('rotates the key on demand, keeping lines and clearing the pending order', () => {
    addCartItem(line({ designId: 'des-1' }));
    setCartPendingOrder('order-1');
    const before = requireCart();

    rotateCartIdempotencyKey();

    const after = requireCart();
    expect(after.idempotencyKey).not.toBe(before.idempotencyKey);
    expect(after.pendingOrderId).toBeNull();
    expect(after.lines).toEqual(before.lines);
  });
});

describe('clearCartIfPendingOrder', () => {
  it('clears the cart only for the pending order', () => {
    addCartItem(line());
    setCartPendingOrder('order-1');

    clearCartIfPendingOrder('order-other');
    expect(requireCart().lines).toHaveLength(1);

    clearCartIfPendingOrder('order-1');
    expect(getCart()?.lines ?? []).toHaveLength(0);
  });
});

describe('cart storage', () => {
  it('writes a versioned cart without address or account data', () => {
    addCartItem(line({ designId: 'des-1' }));

    const stored = JSON.parse(window.localStorage.getItem(CUSTOMER_CART_STORAGE_KEY) ?? 'null');
    expect(stored).toEqual({
      schemaVersion: 2,
      lines: [expect.objectContaining({ variantId: 'var-1', designId: 'des-1' })],
      idempotencyKey: expect.any(String),
      pendingOrderId: null,
      updatedAt: expect.any(String),
    });
  });

  it('migrates a legacy cart array without losing lines', () => {
    window.localStorage.setItem(
      LEGACY_CUSTOMER_CART_STORAGE_KEY,
      JSON.stringify([line({ quantity: 2 }), line({ variantId: 'var-2' })])
    );

    const cart = requireCart();

    expect(cart.schemaVersion).toBe(2);
    expect(cart.lines.map((item) => [item.variantId, item.quantity])).toEqual([
      ['var-1', 2],
      ['var-2', 1],
    ]);
    expect(cart.idempotencyKey).toEqual(expect.any(String));
    expect(window.localStorage.getItem(LEGACY_CUSTOMER_CART_STORAGE_KEY)).toBeNull();
    expect(requireCart().idempotencyKey).toBe(cart.idempotencyKey);
  });

  it('keeps lines whose price arrives as a decimal string from the API', () => {
    // Prisma decimals are serialised as strings, e.g. product.prices[0].amount = "5000".
    addCartItem(line({ unitPrice: '5000' as unknown as number }));

    const cart = requireCart();
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].unitPrice).toBe(5000);
  });

  it('migrates legacy lines whose price is a decimal string', () => {
    window.localStorage.setItem(
      LEGACY_CUSTOMER_CART_STORAGE_KEY,
      JSON.stringify([{ ...line(), unitPrice: '4500.50' }])
    );

    const cart = requireCart();
    expect(cart.lines).toHaveLength(1);
    expect(cart.lines[0].unitPrice).toBe(4500.5);
  });

  it('purges corrupt storage and reads it as empty', () => {
    window.localStorage.setItem(CUSTOMER_CART_STORAGE_KEY, '{not json');

    expect(getCart()).toBeNull();
    expect(window.localStorage.getItem(CUSTOMER_CART_STORAGE_KEY)).toBeNull();
  });

  it('purges a cart with an invalid shape', () => {
    window.localStorage.setItem(
      CUSTOMER_CART_STORAGE_KEY,
      JSON.stringify({ schemaVersion: 2, lines: [{ bad: true }], idempotencyKey: 'k' })
    );

    expect(getCart()).toBeNull();
    expect(window.localStorage.getItem(CUSTOMER_CART_STORAGE_KEY)).toBeNull();
  });
});
