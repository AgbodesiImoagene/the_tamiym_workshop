import { test, expect } from '../fixtures/test';

/**
 * TTW-110: an admin finds a failed confirmation e-mail, acknowledges it and resends it,
 * then resends two more at once.
 *
 * The test changes the seeded failed e-mails for good (each can be resent once), so it
 * needs a database where the seed has not been used by another run (see the
 * throwaway-database note in AGENTS.md).
 *
 * Recipients are masked by the API to their first letter: the seed gives each failed
 * e-mail its own (`o***` not acknowledged, `a***` acknowledged, `b***` and `c***` for the
 * bulk resend).
 */
test.describe('Admin failed e-mails journey @journey @admin @critical', () => {
  test.describe.configure({ mode: 'serial' });

  test('the failures are listed with masked recipients and no raw address', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/notifications/failed');
    await expect(adminPage.getByRole('heading', { name: 'Failed notifications' })).toBeVisible();

    const rows = adminPage.getByTestId('dead-letter-row');
    await expect(rows.filter({ hasText: 'o***@example.com' })).toHaveCount(1);
    await expect(rows.filter({ hasText: 'a***@example.com' })).toHaveCount(1);
    await expect(adminPage.locator('main')).not.toContainText('oscar.failed@example.com');
  });

  test('the "not acknowledged" filter narrows the list', async ({ adminPage }) => {
    await adminPage.goto('/admin/notifications/failed');
    await adminPage.getByLabel('Acknowledgement').click();
    await adminPage.getByRole('option', { name: 'Not acknowledged' }).click();

    const rows = adminPage.getByTestId('dead-letter-row');
    await expect(rows.filter({ hasText: 'o***@example.com' })).toHaveCount(1);
    await expect(rows.filter({ hasText: 'a***@example.com' })).toHaveCount(0);
  });

  test('a failure that is not acknowledged cannot be selected for a bulk resend', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/notifications/failed');
    await expect(
      adminPage.getByRole('checkbox', { name: /^Select PaymentConfirmed to o\*\*\*/ })
    ).toBeDisabled();
  });

  test('acknowledge a failure, then resend it', async ({ adminPage }) => {
    await adminPage.goto('/admin/notifications/failed');
    await adminPage.getByRole('button', { name: /^Open PaymentConfirmed to o\*\*\*/ }).click();

    const detail = adminPage.getByTestId('dead-letter-detail');
    await expect(detail.getByTestId('dead-letter-attempt')).toHaveCount(3);

    // Resend is not offered until the failure is acknowledged.
    await expect(detail.getByTestId('dead-letter-resend-hint')).toHaveText(
      'Acknowledge this failure first.'
    );
    await expect(detail.getByRole('button', { name: 'Resend', exact: true })).toBeDisabled();

    await detail.getByLabel('Note (optional)').fill('Customer was told by phone');
    await detail.getByRole('button', { name: 'Acknowledge failure' }).click();
    await expect(detail.getByRole('status')).toHaveText(
      'Failure acknowledged. You can resend it now.'
    );

    // A reason is required.
    const resend = detail.getByRole('button', { name: 'Resend', exact: true });
    await expect(resend).toBeDisabled();
    // Too short: the screen says so before anything is sent.
    await detail.getByLabel('Reason for resending').fill('ab');
    await expect(detail.getByText('Enter at least 3 characters.')).toBeVisible();
    await expect(resend).toBeDisabled();
    await detail.getByLabel('Reason for resending').fill('Mail provider is back');
    await resend.click();
    await expect(detail.getByRole('status')).toHaveText(
      'Resent as generation 2. It is queued for delivery.'
    );

    // The same failure cannot be resent twice: the screen says why.
    await expect(detail.getByTestId('dead-letter-resend-hint')).toContainText('already resent');
    await expect(resend).toBeDisabled();
  });

  test('a failure that was already resent is marked in the list and cannot be selected', async ({
    adminPage,
  }) => {
    await adminPage.goto('/admin/notifications/failed');
    const row = adminPage
      .getByTestId('dead-letter-row')
      .filter({ hasText: 'o***@example.com' })
      .first();
    await expect(row).toContainText('Already resent');
    await expect(
      adminPage.getByRole('checkbox', { name: /^Select PaymentConfirmed to o\*\*\*/ })
    ).toBeDisabled();
  });

  test('resend two failures at once and see the result for each', async ({ adminPage }) => {
    await adminPage.goto('/admin/notifications/failed');

    const bulkButton = adminPage.getByRole('button', { name: /^Resend selected/ });
    await expect(bulkButton).toBeDisabled();

    await adminPage.getByRole('checkbox', { name: /^Select PaymentConfirmed to b\*\*\*/ }).click();
    await adminPage.getByRole('checkbox', { name: /^Select PaymentConfirmed to c\*\*\*/ }).click();
    await expect(bulkButton).toHaveText('Resend selected (2)');
    // Still disabled: no reason yet.
    await expect(bulkButton).toBeDisabled();

    await adminPage
      .getByLabel('Reason for resending the selected failures')
      .fill('Mail provider is back');
    await bulkButton.click();

    const results = adminPage.getByTestId('dead-letter-bulk-results');
    await expect(results.getByText(/resent as generation 2/)).toHaveCount(2);
    // Each line names the e-mail (event and masked recipient), not an internal id.
    await expect(results).toContainText(
      'PaymentConfirmed to b***@example.com: resent as generation 2.'
    );
    await expect(results).toContainText(
      'PaymentConfirmed to c***@example.com: resent as generation 2.'
    );
  });

  test('the notifications page links to the failed notifications', async ({ adminPage }) => {
    await adminPage.goto('/admin/notifications');
    await adminPage.getByRole('link', { name: 'Failed notifications' }).click();
    await expect(adminPage).toHaveURL(/\/admin\/notifications\/failed$/);
    await expect(adminPage.getByRole('heading', { name: 'Failed notifications' })).toBeVisible();
  });
});
