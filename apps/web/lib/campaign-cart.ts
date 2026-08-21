/**
 * Versioned web campaign cart (TTW-032 interim policy
 * `web-fundraiser-checkout/v1-interim-2026-08-21`).
 *
 * Stores ids + quantity only. Never prices or PII.
 */

import type { FundraiserSelection } from './fundraisers';

export const CAMPAIGN_CART_SCHEMA_VERSION = 1 as const;
export const CAMPAIGN_CART_STORAGE_KEY = 'ttw.web.campaign-cart.v1';

export type CampaignCartLine = {
  campaignProductId: string;
  productId: string;
  variantId: string;
  designId: string;
  quantity: number;
};

export type CampaignCart = {
  schemaVersion: typeof CAMPAIGN_CART_SCHEMA_VERSION;
  campaignId: string;
  lines: CampaignCartLine[];
  /** Stable per cart revision; sent as order create idempotencyKey. */
  idempotencyKey: string;
  pendingOrderId?: string | null;
  updatedAt: string;
};

export type CampaignCartLoadResult =
  | { ok: true; cart: CampaignCart | null }
  | { ok: false; reason: 'corrupt' | 'unsupported_version' };

function newIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `cart-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isPositiveIntQuantity(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 99;
}

function isCartLine(value: unknown): value is CampaignCartLine {
  if (!value || typeof value !== 'object') return false;
  const line = value as Record<string, unknown>;
  return (
    isNonEmptyString(line.campaignProductId) &&
    isNonEmptyString(line.productId) &&
    isNonEmptyString(line.variantId) &&
    isNonEmptyString(line.designId) &&
    isPositiveIntQuantity(line.quantity)
  );
}

/** Validate and normalize a parsed cart; returns null when shape is invalid. */
export function parseCampaignCart(raw: unknown): CampaignCartLoadResult {
  if (raw == null) {
    return { ok: true, cart: null };
  }
  if (typeof raw !== 'object') {
    return { ok: false, reason: 'corrupt' };
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schemaVersion !== CAMPAIGN_CART_SCHEMA_VERSION) {
    return { ok: false, reason: 'unsupported_version' };
  }
  if (!isNonEmptyString(obj.campaignId) || !isNonEmptyString(obj.idempotencyKey)) {
    return { ok: false, reason: 'corrupt' };
  }
  if (!Array.isArray(obj.lines) || obj.lines.length === 0 || !obj.lines.every(isCartLine)) {
    return { ok: false, reason: 'corrupt' };
  }
  if (
    obj.pendingOrderId != null &&
    obj.pendingOrderId !== undefined &&
    !isNonEmptyString(obj.pendingOrderId)
  ) {
    return { ok: false, reason: 'corrupt' };
  }
  if (typeof obj.updatedAt !== 'string') {
    return { ok: false, reason: 'corrupt' };
  }

  return {
    ok: true,
    cart: {
      schemaVersion: CAMPAIGN_CART_SCHEMA_VERSION,
      campaignId: obj.campaignId,
      lines: obj.lines.map((line) => ({
        campaignProductId: line.campaignProductId,
        productId: line.productId,
        variantId: line.variantId,
        designId: line.designId,
        quantity: line.quantity,
      })),
      idempotencyKey: obj.idempotencyKey,
      pendingOrderId: obj.pendingOrderId ?? null,
      updatedAt: obj.updatedAt,
    },
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

export function loadCampaignCart(): CampaignCart | null {
  const storage = safeLocalStorage();
  if (!storage) return null;
  let rawText: string | null;
  try {
    rawText = storage.getItem(CAMPAIGN_CART_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!rawText) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText) as unknown;
  } catch {
    clearCampaignCart();
    return null;
  }

  const result = parseCampaignCart(parsed);
  if (!result.ok) {
    clearCampaignCart();
    return null;
  }
  return result.cart;
}

export function saveCampaignCart(cart: CampaignCart): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(CAMPAIGN_CART_STORAGE_KEY, JSON.stringify(cart));
  } catch {
    // Quota / privacy mode — checkout will see an empty cart.
  }
}

export function clearCampaignCart(): void {
  const storage = safeLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(CAMPAIGN_CART_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function selectionToLine(selection: FundraiserSelection): CampaignCartLine {
  return {
    campaignProductId: selection.campaignProductId,
    productId: selection.productId,
    variantId: selection.variantId,
    designId: selection.designId,
    quantity: selection.quantity,
  };
}

/** True when adding this selection would replace a different campaign's cart. */
export function needsCampaignReplaceConfirm(
  cart: CampaignCart | null,
  campaignId: string
): boolean {
  return !!cart && cart.lines.length > 0 && cart.campaignId !== campaignId;
}

function lineIdentityKey(line: CampaignCartLine): string {
  return `${line.campaignProductId}:${line.variantId}:${line.designId}`;
}

/**
 * Add or merge a selection into the cart. Caller must confirm replace when
 * `needsCampaignReplaceConfirm` is true; pass `replaceCampaign: true` to wipe.
 */
export function addSelectionToCart(
  cart: CampaignCart | null,
  selection: FundraiserSelection,
  options?: { replaceCampaign?: boolean }
): CampaignCart {
  const line = selectionToLine(selection);
  const now = new Date().toISOString();

  if (!cart || cart.lines.length === 0 || options?.replaceCampaign) {
    return {
      schemaVersion: CAMPAIGN_CART_SCHEMA_VERSION,
      campaignId: selection.campaignId,
      lines: [line],
      idempotencyKey: newIdempotencyKey(),
      pendingOrderId: null,
      updatedAt: now,
    };
  }

  if (cart.campaignId !== selection.campaignId) {
    throw new Error('Campaign mismatch: confirm replace before adding');
  }

  const key = lineIdentityKey(line);
  const existingIndex = cart.lines.findIndex((item) => lineIdentityKey(item) === key);
  const nextLines =
    existingIndex >= 0
      ? cart.lines.map((item, index) =>
          index === existingIndex
            ? {
                ...item,
                quantity: Math.min(99, item.quantity + line.quantity),
              }
            : item
        )
      : [...cart.lines, line];

  return {
    schemaVersion: CAMPAIGN_CART_SCHEMA_VERSION,
    campaignId: cart.campaignId,
    lines: nextLines,
    idempotencyKey: newIdempotencyKey(),
    pendingOrderId: null,
    updatedAt: now,
  };
}

export function setPendingOrderId(cart: CampaignCart, orderId: string | null): CampaignCart {
  return {
    ...cart,
    pendingOrderId: orderId,
    updatedAt: new Date().toISOString(),
  };
}

export function checkoutPathForSlug(slug: string): string {
  return `/fundraiser/${encodeURIComponent(slug)}/checkout`;
}
