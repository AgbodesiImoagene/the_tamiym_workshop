/**
 * node:test coverage for campaign cart schema invariants (TTW-032).
 * Run: node --experimental-strip-types --test apps/web/lib/campaign-cart.test.ts
 */

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  CAMPAIGN_CART_SCHEMA_VERSION,
  addSelectionToCart,
  checkoutPathForSlug,
  needsCampaignReplaceConfirm,
  parseCampaignCart,
  selectionToLine,
  type CampaignCart,
} from './campaign-cart.ts';

const selectionA = {
  campaignId: 'camp-1',
  campaignProductId: 'cp-1',
  productId: 'prod-1',
  variantId: 'var-1',
  designId: 'des-1',
  quantity: 2,
};

const selectionB = {
  campaignId: 'camp-2',
  campaignProductId: 'cp-2',
  productId: 'prod-2',
  variantId: 'var-2',
  designId: 'des-2',
  quantity: 1,
};

describe('parseCampaignCart', () => {
  it('accepts null as empty', () => {
    assert.deepEqual(parseCampaignCart(null), { ok: true, cart: null });
  });

  it('rejects corrupt payloads', () => {
    assert.equal(parseCampaignCart('nope').ok, false);
    assert.equal(parseCampaignCart({ schemaVersion: 1 }).ok, false);
    assert.equal(
      parseCampaignCart({
        schemaVersion: 1,
        campaignId: 'c',
        idempotencyKey: 'k',
        lines: [{ bad: true }],
        updatedAt: '2026-01-01T00:00:00.000Z',
      }).ok,
      false
    );
  });

  it('rejects unsupported schema versions', () => {
    const result = parseCampaignCart({
      schemaVersion: 99,
      campaignId: 'c',
      idempotencyKey: 'k',
      lines: [selectionToLine(selectionA)],
      updatedAt: '2026-01-01T00:00:00.000Z',
    });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, 'unsupported_version');
  });

  it('accepts a valid v1 cart', () => {
    const raw = {
      schemaVersion: CAMPAIGN_CART_SCHEMA_VERSION,
      campaignId: 'camp-1',
      idempotencyKey: 'idem-1',
      lines: [selectionToLine(selectionA)],
      pendingOrderId: null,
      updatedAt: '2026-08-21T00:00:00.000Z',
    };
    const result = parseCampaignCart(raw);
    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.cart?.campaignId, 'camp-1');
      assert.equal(result.cart?.lines[0]?.quantity, 2);
    }
  });
});

describe('addSelectionToCart / replace', () => {
  it('creates a cart from an empty state with a fresh idempotency key', () => {
    const cart = addSelectionToCart(null, selectionA);
    assert.equal(cart.campaignId, 'camp-1');
    assert.equal(cart.lines.length, 1);
    assert.ok(cart.idempotencyKey.length > 0);
    assert.equal(cart.pendingOrderId, null);
  });

  it('merges quantity for the same line and rotates idempotency', () => {
    const first = addSelectionToCart(null, selectionA);
    const second = addSelectionToCart(first, { ...selectionA, quantity: 3 });
    assert.equal(second.lines.length, 1);
    assert.equal(second.lines[0]?.quantity, 5);
    assert.notEqual(second.idempotencyKey, first.idempotencyKey);
    assert.equal(second.pendingOrderId, null);
  });

  it('requires replace confirmation across campaigns', () => {
    const cart = addSelectionToCart(null, selectionA);
    assert.equal(needsCampaignReplaceConfirm(cart, 'camp-2'), true);
    assert.throws(() => addSelectionToCart(cart, selectionB));
    const replaced = addSelectionToCart(cart, selectionB, { replaceCampaign: true });
    assert.equal(replaced.campaignId, 'camp-2');
    assert.equal(replaced.lines[0]?.variantId, 'var-2');
    assert.notEqual(replaced.idempotencyKey, cart.idempotencyKey);
  });

  it('does not require replace for the same campaign', () => {
    const cart: CampaignCart = addSelectionToCart(null, selectionA);
    assert.equal(needsCampaignReplaceConfirm(cart, 'camp-1'), false);
  });
});

describe('checkoutPathForSlug', () => {
  it('builds a path-only checkout URL segment', () => {
    assert.equal(checkoutPathForSlug('school-kits'), '/fundraiser/school-kits/checkout');
  });
});
