'use client';

import { useEffect, useMemo, useState } from 'react';

const CART_STORAGE_KEY = 'ttw-customer-cart';
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
}

function readCartItems() {
  if (typeof window === 'undefined') {
    return [] as CartItem[];
  }

  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as CartItem[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCartItems(items: CartItem[]) {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(CART_EVENT));
}

export function getCartItems() {
  return readCartItems();
}

export function addCartItem(item: CartItem) {
  const items = readCartItems();
  const existing = items.find((entry) => entry.variantId === item.variantId);

  if (existing) {
    existing.quantity += item.quantity;
    writeCartItems([...items]);
    return;
  }

  writeCartItems([...items, item]);
}

export function updateCartItemQuantity(variantId: string, quantity: number) {
  const items = readCartItems()
    .map((item) => (item.variantId === variantId ? { ...item, quantity } : item))
    .filter((item) => item.quantity > 0);

  writeCartItems(items);
}

export function removeCartItem(variantId: string) {
  writeCartItems(readCartItems().filter((item) => item.variantId !== variantId));
}

export function clearCart() {
  writeCartItems([]);
}

export function getCartSubtotal(items: CartItem[]) {
  return items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);
}

export function useCart() {
  const [items, setItems] = useState<CartItem[]>([]);

  useEffect(() => {
    const sync = () => {
      setItems(readCartItems());
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
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = getCartSubtotal(items);
    const currency = items[0]?.currency ?? 'NGN';

    return {
      itemCount,
      subtotal,
      currency,
    };
  }, [items]);

  return {
    items,
    ...summary,
  };
}
