'use client';

/**
 * Versioned standard cart (TTW-037), modelled on the web campaign cart
 * (`apps/web/lib/campaign-cart.ts`). One `idempotencyKey` per cart revision is
 * sent as the order create key, so retries of the same cart reuse one order.
 *
 * Stores ids, quantities and display labels only. Never addresses, emails or tokens.
 */

import { useEffect, useMemo, useState } from 'react';

export const CUSTOMER_CART_SCHEMA_VERSION = 2 as const;
export const CUSTOMER_CART_STORAGE_KEY = 'ttw.app.customer-cart.v2';
export const LEGACY_CUSTOMER_CART_STORAGE_KEY = 'ttw-customer-cart';
const CART_EVENT = 'ttw-customer-cart-updated';

export interface CartItem {
  productId: string;
  productName: string;
  variantId: string;
  variantName: string;
  optionSummary: string;
  quantity: number;
  unitPrice: number;
  currency: string;
  imageUrl?: string | null;
  /** Saved design printed on this line; two designs on one variant are two lines. */
  designId?: string | null;
}

export interface CustomerCart {
  schemaVersion: typeof CUSTOMER_CART_SCHEMA_VERSION;
  lines: CartItem[];
  /** Stable per cart revision; sent as order create idempotencyKey. */
  idempotencyKey: string;
  pendingOrderId: string | null;
  updatedAt: string;
}

export function cartLineKey(item: Pick<CartItem, 'variantId' | 'designId'>): string {
  return `${item.variantId}:${item.designId ?? ''}`;
}

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cart-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** API decimals (Prisma `Decimal`) arrive as strings such as "5000.00". */
function toPrice(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return Number.NaN;
}

function isCartItem(value: unknown): value is CartItem {
  if (!value || typeof value !== 'object') return false;
  const line = value as Record<string, unknown>;
  return (
    isNonEmptyString(line.productId) &&
    typeof line.productName === 'string' &&
    isNonEmptyString(line.variantId) &&
    typeof line.variantName === 'string' &&
    typeof line.optionSummary === 'string' &&
    typeof line.quantity === 'number' &&
    Number.isInteger(line.quantity) &&
    line.quantity >= 1 &&
    Number.isFinite(toPrice(line.unitPrice)) &&
    typeof line.currency === 'string' &&
    (line.designId == null || isNonEmptyString(line.designId))
  );
}

function toCartItem(line: CartItem): CartItem {
  return {
    productId: line.productId,
    productName: line.productName,
    variantId: line.variantId,
    variantName: line.variantName,
    optionSummary: line.optionSummary,
    quantity: line.quantity,
    unitPrice: toPrice(line.unitPrice),
    currency: line.currency,
    imageUrl: line.imageUrl ?? null,
    designId: line.designId ?? null,
  };
}

function mergeLines(lines: CartItem[]): CartItem[] {
  const merged: CartItem[] = [];
  for (const line of lines) {
    const existing = merged.find((item) => cartLineKey(item) === cartLineKey(line));
    if (existing) {
      existing.quantity += line.quantity;
    } else {
      merged.push(toCartItem(line));
    }
  }
  return merged;
}

function parseCart(raw: unknown): CustomerCart | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (
    obj.schemaVersion !== CUSTOMER_CART_SCHEMA_VERSION ||
    !isNonEmptyString(obj.idempotencyKey) ||
    typeof obj.updatedAt !== 'string' ||
    !Array.isArray(obj.lines) ||
    obj.lines.length === 0 ||
    !obj.lines.every(isCartItem) ||
    (obj.pendingOrderId != null && !isNonEmptyString(obj.pendingOrderId))
  ) {
    return null;
  }
  return {
    schemaVersion: CUSTOMER_CART_SCHEMA_VERSION,
    lines: obj.lines.map(toCartItem),
    idempotencyKey: obj.idempotencyKey,
    pendingOrderId: obj.pendingOrderId ?? null,
    updatedAt: obj.updatedAt,
  };
}

function safeLocalStorage(): Storage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function removeKey(storage: Storage, key: string) {
  try {
    storage.removeItem(key);
  } catch {
    // ignore
  }
}

function readJson(storage: Storage, key: string): { found: boolean; value: unknown } {
  let text: string | null;
  try {
    text = storage.getItem(key);
  } catch {
    return { found: false, value: null };
  }
  if (!text) return { found: false, value: null };
  try {
    return { found: true, value: JSON.parse(text) as unknown };
  } catch {
    return { found: true, value: undefined };
  }
}

function writeCart(cart: CustomerCart | null) {
  const storage = safeLocalStorage();
  if (!storage) return;
  if (!cart || cart.lines.length === 0) {
    removeKey(storage, CUSTOMER_CART_STORAGE_KEY);
  } else {
    try {
      storage.setItem(CUSTOMER_CART_STORAGE_KEY, JSON.stringify(cart));
    } catch {
      // Quota / privacy mode — checkout will see an empty cart.
    }
  }
  window.dispatchEvent(new Event(CART_EVENT));
}

/** Read the cart once from its legacy array format, then drop the legacy key. */
function migrateLegacyCart(storage: Storage): CustomerCart | null {
  const legacy = readJson(storage, LEGACY_CUSTOMER_CART_STORAGE_KEY);
  if (!legacy.found) return null;
  removeKey(storage, LEGACY_CUSTOMER_CART_STORAGE_KEY);

  const lines = Array.isArray(legacy.value) ? legacy.value.filter(isCartItem) : [];
  if (lines.length === 0) return null;

  const cart: CustomerCart = {
    schemaVersion: CUSTOMER_CART_SCHEMA_VERSION,
    lines: mergeLines(lines),
    idempotencyKey: newIdempotencyKey(),
    pendingOrderId: null,
    updatedAt: new Date().toISOString(),
  };
  try {
    storage.setItem(CUSTOMER_CART_STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // ignore
  }
  return cart;
}

export function getCart(): CustomerCart | null {
  const storage = safeLocalStorage();
  if (!storage) return null;

  const stored = readJson(storage, CUSTOMER_CART_STORAGE_KEY);
  if (!stored.found) return migrateLegacyCart(storage);

  const cart = parseCart(stored.value);
  if (!cart) {
    removeKey(storage, CUSTOMER_CART_STORAGE_KEY);
    return null;
  }
  return cart;
}

/** Any change to the lines is a new cart revision: new key, no pending order. */
function writeLines(lines: CartItem[]) {
  writeCart({
    schemaVersion: CUSTOMER_CART_SCHEMA_VERSION,
    lines,
    idempotencyKey: newIdempotencyKey(),
    pendingOrderId: null,
    updatedAt: new Date().toISOString(),
  });
}

export function addCartItem(item: CartItem) {
  writeLines(mergeLines([...(getCart()?.lines ?? []), item]));
}

export function updateCartItemQuantity(lineKey: string, quantity: number) {
  const lines = (getCart()?.lines ?? [])
    .map((item) => (cartLineKey(item) === lineKey ? { ...item, quantity } : item))
    .filter((item) => item.quantity > 0);

  writeLines(lines);
}

export function removeCartItem(lineKey: string) {
  writeLines((getCart()?.lines ?? []).filter((item) => cartLineKey(item) !== lineKey));
}

export function clearCart() {
  writeCart(null);
}

/**
 * Record the order created for this cart revision; the key stays the same. With
 * `forIdempotencyKey`, a cart changed meanwhile (other tab) is left untouched.
 */
export function setCartPendingOrder(orderId: string, forIdempotencyKey?: string) {
  const cart = getCart();
  if (!cart) return;
  if (forIdempotencyKey !== undefined && cart.idempotencyKey !== forIdempotencyKey) return;
  writeCart({ ...cart, pendingOrderId: orderId, updatedAt: new Date().toISOString() });
}

/** Start a new revision of the same lines, e.g. after the pending order expired. */
export function rotateCartIdempotencyKey() {
  const cart = getCart();
  if (!cart) return;
  writeLines(cart.lines);
}

/** Clear the cart once its pending order is paid; other orders leave it untouched. */
export function clearCartIfPendingOrder(orderId: string) {
  if (getCart()?.pendingOrderId === orderId) {
    clearCart();
  }
}

export function getCartSubtotal(items: CartItem[]) {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

export function useCart() {
  const [cart, setCart] = useState<CustomerCart | null>(null);

  useEffect(() => {
    const sync = () => {
      setCart(getCart());
    };

    sync();
    window.addEventListener(CART_EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(CART_EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);

  const summary = useMemo(() => {
    const items = cart?.lines ?? [];
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = getCartSubtotal(items);
    const currency = items[0]?.currency ?? 'NGN';

    return {
      items,
      itemCount,
      subtotal,
      currency,
      idempotencyKey: cart?.idempotencyKey ?? null,
      pendingOrderId: cart?.pendingOrderId ?? null,
    };
  }, [cart]);

  return summary;
}
