import { test, expect } from '../fixtures/test';
import { createAdminApi } from '../fixtures/admin-api';

/**
 * TTW-015 — reconciliation admin contract, against the real API (TTW-209).
 *
 * The finding comes from `seed:e2e` (run `e2e-reconciliation-run`). It is
 * RESOLVED, in an INCOMPLETE run, so no dashboard figure counts it.
 */
test.describe('Reconciliation admin @smoke', () => {
  test('admin findings list returns masked comparison fields', async () => {
    const admin = await createAdminApi();
    try {
      const res = await admin.get('admin/reconciliation/findings?runId=e2e-reconciliation-run');
      expect(res.status()).toBe(200);
      const page = (await res.json()) as { items: Record<string, unknown>[]; nextCursor: unknown };

      expect(page.items).toHaveLength(1);
      const [finding] = page.items;
      expect(finding.severity).toBe('CRITICAL');
      expect(finding.leftValue).toBe('100');
      expect(finding.rightValue).toBe('50');
      // Masked: only ids survive from sourceIds, and raw evidence is never returned.
      expect(finding.sourceIds).toEqual({ campaignId: 'e2e-campaign-campus-outreach' });
      expect(finding).not.toHaveProperty('evidence');
      expect(JSON.stringify(page)).not.toContain('e2e-secret-payload');
    } finally {
      await admin.dispose();
    }
  });
});
