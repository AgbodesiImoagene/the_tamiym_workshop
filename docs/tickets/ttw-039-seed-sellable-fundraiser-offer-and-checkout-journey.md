# TTW-039 — Seed a sellable fundraiser offer and automate the supporter checkout journey

**Epic:** 3 — Complete customer and fundraiser revenue journeys\
**Status:** Not started\
**Risk:** Standard\
**Blocked by:** TTW-037 (the journey below asserts its 409 `IDEMPOTENCY_KEY_PAYLOAD_MISMATCH` behaviour)\
**Blocks:** None

## Background

The e2e seed (`apps/api/scripts/seed-e2e-dummy-data.ts`) gives the active campaign `campus-outreach-drive-e2e` one product, `e2e-campaign-product-campus-tee` (`seed-e2e-dummy-data.ts:1116-1122`), with no design. Public offers only include campaign products whose design is `APPROVED` (`apps/api/src/pricing/pricing.service.ts:698-703`), so the fundraiser page shows "No sellable products are available for this campaign right now." and no browser test can buy from a fundraiser. `tests/e2e/web/fundraiser-detail.comprehensive.spec.ts` returns early on that empty state, and the manifest entry `WEB-CHECKOUT` (`docs/playwright/prd-test-manifest.json`) is still `blocked`.

Found on 2026-11-02 while verifying TTW-037: a new Playwright journey for the fundraiser checkout failed at its first step ("Add to cart" never appears). The spec was removed from TTW-037 and is kept in the appendix below.

The seeded customer address phone `08000000004` is also rejected by `@IsPhoneNumber()` when the checkout saves the address (`apps/api/src/addresses/dto/create-address.dto.ts:34`), so every checkout with the seed address fails at "Review quote" unless the test types another number.

## Proposal

- Seed an `APPROVED` design for the tee owned by the organiser and attached to the active campaign, and set it as `designId` of `e2e-campaign-product-campus-tee`, with the view data the public offer needs.
- Give the seeded customer address a valid phone (international format, e.g. `+2348012345678`) so the spec no longer needs to override it.
- Restore the spec from the appendix as `tests/e2e/web/fundraiser-checkout-retry.spec.ts` (dropping the phone override once the seed is fixed), and mark `WEB-CHECKOUT` as automated with that test.
- Let `fundraiser-detail.comprehensive.spec.ts` stop treating the empty state as a pass for the active campaign.

## Invariants

- Seed data stays deterministic and test-only (`assertTestDatabase`), with `e2e-` prefixed ids.
- Moderation rules are unchanged: only approved designs are sellable.

## Implementation plan

1. Extend the seed (design, campaign product `designId`, valid phone), keeping `clearFixtureData` able to remove it.
2. Restore the spec and update the manifest.
3. Run the web Playwright projects and the existing fundraiser specs.

## Test and observability plan

- Integration/e2e: the restored journey (failed payment attempt, address edit, 409 then new order); `fundraiser-detail.comprehensive.spec.ts` buys a real offer.
- Failure, retry, and concurrency: covered by the journey (aborted initiate-payment, stale key).
- Logs, metrics, traces, and alerts: none.

## References

- `apps/api/scripts/seed-e2e-dummy-data.ts:1116-1122` — campaign product without design.
- `apps/api/src/pricing/pricing.service.ts:698-703` — approved design required for public offers.
- `apps/api/src/addresses/dto/create-address.dto.ts:34` — phone validation.
- `docs/tickets/ttw-037-prevent-duplicate-standard-checkout-orders.md` — verification evidence of the failed journey.

## Acceptance criteria

- [ ] The active seed campaign shows at least one sellable offer on the public page.
- [ ] The seeded customer address saves without a validation error.
- [ ] `tests/e2e/web/fundraiser-checkout-retry.spec.ts` passes; `WEB-CHECKOUT` is automated in the manifest.
- [ ] `pnpm playwright:validate` and the web Playwright projects pass, with output recorded below.

## Out of scope

- Any change to moderation or pricing rules.
- Seed cleanup of orders created by browser tests (`seed:e2e` cannot delete products referenced by them): follow-up if it gets in the way.

## Design review

Pending.

## Implementation reviews

Pending.

## Verification evidence

Pending implementation.

## Completion summary

Pending implementation.

## Appendix — journey spec removed from TTW-037

```ts
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test, urls } from '../fixtures/test';
import { E2E_CAMPAIGN_SLUG_ACTIVE } from '../fixtures/seed-data';

const customerState = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../.auth/customer.json'
);

/**
 * TTW-037 review finding 6 — a supporter who edits the delivery address after a
 * failed payment attempt gets a new order for the new address, never the old order.
 *
 * The API answers the stale key with 409 IDEMPOTENCY_KEY_PAYLOAD_MISMATCH. The browser
 * logs that expected 409 as a console error, so this journey uses its own context
 * instead of the strict-guard fixture pages. Only payment initiation is intercepted
 * (Paystack is simulated); quotes and orders hit the real API.
 */
test.describe('Fundraiser checkout address change @web @journey', () => {
  test('editing the address after a failed attempt creates a new order for the new address', async ({
    browser,
    paystack,
  }) => {
    const context = await browser.newContext({ baseURL: urls.web, storageState: customerState });
    const page = await context.newPage();

    const createResponses: Array<{ status: number; id?: string; code?: string }> = [];
    page.on('response', async (response) => {
      if (
        response.request().method() === 'POST' &&
        /\/v1\/campaigns\/[^/]+\/orders$/.test(response.url())
      ) {
        const body = (await response.json().catch(() => null)) as {
          id?: string;
          code?: string;
          message?: { code?: string };
        } | null;
        createResponses.push({
          status: response.status(),
          id: body?.id,
          code: body?.code ?? body?.message?.code,
        });
      }
    });

    let initiateCalls = 0;
    await page.route('**/v1/orders/*/initiate-payment', async (route) => {
      initiateCalls += 1;
      if (initiateCalls === 1) {
        await route.abort('aborted');
        return;
      }
      const orderId = route.request().url().split('/orders/')[1].split('/')[0];
      const session = paystack.initializeTransaction(`ord-${orderId}`);
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...session, attemptOutcome: session.outcome }),
      });
    });
    await page.route('https://checkout.paystack.test/**', (route) =>
      route.fulfill({ status: 200, contentType: 'text/html', body: '<h1>Paystack test</h1>' })
    );

    await page.goto(`/fundraiser/${E2E_CAMPAIGN_SLUG_ACTIVE}`);
    await page.getByRole('button', { name: /Add to cart/i }).click();
    await page.getByRole('button', { name: /Checkout/i }).click();
    await expect(page.getByLabel('City')).toHaveValue('Ikeja');

    // The seeded phone fails the address validator; use a valid one (see TTW-037 notes).
    await page.getByLabel('Phone').fill('+2348012345678');
    const reviewQuote = page.getByRole('button', { name: 'Review authoritative quote' });
    const placeOrder = page.getByRole('button', { name: 'Accept quote & pay with Paystack' });

    await reviewQuote.click();
    await page.getByRole('checkbox').check();
    await placeOrder.click();
    await expect(placeOrder).toBeEnabled();

    // Edit the address and try again with the quote still on screen.
    await page.getByLabel('Address line 1').fill('9 Other Street');
    await placeOrder.click();
    await expect(
      page.getByText('Your cart or address changed. Review the quote again.')
    ).toBeVisible();
    await expect(placeOrder).toBeHidden();

    await reviewQuote.click();
    await page.getByRole('checkbox').check();
    await placeOrder.click();
    await page.waitForURL(/checkout\.paystack\.test/);

    expect(createResponses.map((r) => r.status)).toEqual([201, 409, 201]);
    expect(createResponses[1].code).toBe('IDEMPOTENCY_KEY_PAYLOAD_MISMATCH');
    expect(createResponses[2].id).toBeTruthy();
    expect(createResponses[2].id).not.toBe(createResponses[0].id);

    await context.close();
  });
});
```
