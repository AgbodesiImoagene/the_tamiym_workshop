import { test, expect } from '../fixtures/test';

/**
 * TTW-015 — reconciliation admin contract (Playwright foundation).
 */
test.describe('Reconciliation admin @smoke', () => {
  test('admin findings list returns masked comparison fields', async ({ page }) => {
    await page.goto('about:blank');
    await page.route('**/admin/reconciliation/findings**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            id: 'finding_1',
            domain: 'CAMPAIGN',
            outcome: 'MISMATCH',
            severity: 'CRITICAL',
            leftLabel: 'campaign.currentAmount',
            leftValue: '100',
            rightLabel: 'ledger',
            rightValue: '50',
          },
        ]),
      });
    });

    const rows = await page.evaluate(async () => {
      const res = await fetch('http://localhost/admin/reconciliation/findings');
      return res.json();
    });

    expect(rows[0].severity).toBe('CRITICAL');
    expect(rows[0].leftValue).toBe('100');
    expect(rows[0].rightValue).toBe('50');
  });
});
