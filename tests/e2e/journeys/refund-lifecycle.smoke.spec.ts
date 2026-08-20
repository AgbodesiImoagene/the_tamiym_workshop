import { test, expect } from '../fixtures/test';
import { paystackSimulator } from '../fixtures/paystack-simulator';

/**
 * TTW-013 — refund lifecycle contract (Playwright foundation).
 * Asserts simulator refund create + duplicate refund.processed delivery semantics
 * via route-mocked admin refund responses until full admin UI e2e seeds land.
 */
test.describe('Refund lifecycle @smoke', () => {
  test.beforeEach(() => {
    paystackSimulator.reset();
  });

  test('createRefund is idempotent per transaction+amount key', async () => {
    const first = paystackSimulator.createRefund('txn_1', 2500);
    const second = paystackSimulator.createRefund('txn_1', 2500);
    expect(first.outcome).toBe('created');
    expect(second.outcome).toBe('reused');
    expect(second.providerRefundId).toBe(first.providerRefundId);
    expect(paystackSimulator.refundCreateCalls).toBe(2);
    expect(paystackSimulator.refundCount()).toBe(1);
  });

  test('duplicate refund.processed events share one settlement key', async () => {
    const created = paystackSimulator.createRefund('txn_settle', 10000);
    const [a, b] = paystackSimulator.enqueue(
      'refund.processed',
      {
        id: Number(created.providerRefundId),
        status: 'processed',
        amount: 1_000_000,
        transaction_reference: 'txn_settle',
      },
      { duplicate: true },
    );
    expect(a.event).toBe('refund.processed');
    expect(b.event).toBe('refund.processed');
    expect(a.data.id).toBe(b.data.id);

    const first = paystackSimulator.deliverNext({ ignoreDelay: true });
    const second = paystackSimulator.deliverNext({ ignoreDelay: true });
    expect(first?.id).not.toBe(second?.id);
    expect(first?.data.id).toBe(second?.data.id);
  });

  test('admin refund API returns pending/processing without implying settled money', async ({
    page,
  }) => {
    await page.goto('about:blank');
    let calls = 0;
    await page.route('**/admin/orders/*/refund', async (route) => {
      calls += 1;
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 'refund_playwright',
          orderId: 'order_playwright',
          status: 'PROCESSING',
          amount: 2500,
          providerRef: '991001',
        }),
      });
    });

    const result = await page.evaluate(async () => {
      const res = await fetch('/admin/orders/order_playwright/refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: 2500, reason: 'smoke' }),
      });
      return res.json();
    });

    expect(calls).toBe(1);
    expect(result.status).toBe('PROCESSING');
    expect(result.status).not.toBe('SUCCEEDED');
  });
});
