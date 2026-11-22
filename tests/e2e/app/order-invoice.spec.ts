import { readFile } from 'node:fs/promises';
import { expect } from '@playwright/test';
import { test } from '../fixtures/test';

/**
 * TTW-108 — a customer downloads the VAT invoice of a paid order from its page.
 *
 * The seeded DELIVERED campaign order carries a VAT snapshot and the seed sets the seller
 * details, so the real API issues the invoice on the first download. The second download
 * must hand back the same file: the invoice is issued once and never changes.
 */
const PAID_ORDER_ID = 'e2e-order-delivered-campaign';
const UNPAID_ORDER_ID = 'e2e-order-pending-payment';

test.describe('Customer downloads a VAT invoice @app @journey', () => {
  test('a paid order offers the invoice, and a second download is the same file', async ({
    customerPage,
  }) => {
    await customerPage.goto(`/dashboard/orders/${PAID_ORDER_ID}`);
    const button = customerPage.getByRole('button', { name: 'Download invoice' });
    await expect(button).toBeVisible();

    const [first] = await Promise.all([customerPage.waitForEvent('download'), button.click()]);
    expect(first.suggestedFilename()).toMatch(/^invoice-.+\.pdf$/);
    const firstBytes = await readFile((await first.path()) as string);
    expect(firstBytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(firstBytes.length).toBeGreaterThan(1000);
    // No refusal message: the page's own alert is a <p role="alert"> with text.
    await expect(customerPage.locator('p[role="alert"]')).toHaveCount(0);

    const [second] = await Promise.all([customerPage.waitForEvent('download'), button.click()]);
    const secondBytes = await readFile((await second.path()) as string);
    // The same invoice renders to the same bytes: same number, date and amounts.
    expect(secondBytes.equals(firstBytes)).toBe(true);
  });

  test('an order still awaiting payment offers no invoice', async ({ customerPage }) => {
    await customerPage.goto(`/dashboard/orders/${UNPAID_ORDER_ID}`);
    await expect(customerPage.getByRole('button', { name: 'Refresh' })).toBeVisible();
    await expect(customerPage.getByRole('button', { name: 'Download invoice' })).toHaveCount(0);
  });
});
