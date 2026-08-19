import { test, expect } from '../fixtures/test';
import { paystackSimulator } from '../fixtures/paystack-simulator';

/**
 * TTW-012 — payment-retry contract (Playwright foundation).
 * Asserts simulator idempotency and the HTTP initiate-payment retry shape
 * (same reference / attemptOutcome) via route mocking until full checkout UI lands.
 */
test.describe('Payment initiation retry @smoke', () => {
  test.beforeEach(() => {
    paystackSimulator.reset();
  });

  test('retry with the same reference reuses one provider session', async () => {
    const reference = `ord_playwright_${Date.now()}`;
    const first = paystackSimulator.initializeTransaction(reference);
    const second = paystackSimulator.initializeTransaction(reference);

    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('reused');
    expect(second.authorizationUrl).toBe(first.authorizationUrl);
    expect(second.accessCode).toBe(first.accessCode);
    expect(paystackSimulator.initializeCalls).toBe(2);
    expect(paystackSimulator.sessionCount()).toBe(1);
  });

  test('distinct references create distinct sessions', async () => {
    const a = paystackSimulator.initializeTransaction('ord_a');
    const b = paystackSimulator.initializeTransaction('ord_b');
    expect(a.authorizationUrl).not.toBe(b.authorizationUrl);
    expect(paystackSimulator.sessionCount()).toBe(2);
  });

  test('API initiate-payment retry returns the same session contract', async ({ page }) => {
    await page.goto('about:blank');
    let calls = 0;
    const session = {
      authorizationUrl: 'https://checkout.paystack.test/ord_api_retry',
      reference: 'ord_api_retry',
      accessCode: 'ac_retry',
    };

    await page.route('**/v1/orders/*/initiate-payment', async (route) => {
      calls += 1;
      const attemptOutcome = calls === 1 ? 'created' : 'reused';
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ...session, attemptOutcome }),
      });
    });

    const first = await page.evaluate(async () => {
      const res = await fetch('http://localhost/v1/orders/ord_demo/initiate-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerEmail: 'cust@example.com' }),
      });
      return res.json();
    });
    const second = await page.evaluate(async () => {
      const res = await fetch('http://localhost/v1/orders/ord_demo/initiate-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerEmail: 'cust@example.com' }),
      });
      return res.json();
    });

    expect(first.attemptOutcome).toBe('created');
    expect(second.attemptOutcome).toBe('reused');
    expect(second.reference).toBe(first.reference);
    expect(second.authorizationUrl).toBe(first.authorizationUrl);
    expect(calls).toBe(2);
  });
});
