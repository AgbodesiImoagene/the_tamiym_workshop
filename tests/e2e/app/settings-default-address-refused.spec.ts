import { expect, test, type Response } from '@playwright/test';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { originForSurface } from '../fixtures/api';
import { e2eUsers, urls } from '../fixtures/identities';

/**
 * TTW-219: a refused address save leaves the customer's default address as it was.
 *
 * The settings screen is the customer's only address form: it always edits the default
 * address (or creates the first one), sends `isDefault: true`, and never sends a
 * `countryCode`. So the country-code fix is proven by the API tests, and this spec plays
 * what the screen can really do: a save the API refuses (a state that became unavailable
 * between loading the form and saving it) and a valid save. The real API and database are
 * used; nothing is mocked. The state is made unavailable with one SQL statement because
 * no admin route deactivates a state.
 */
const STATE_CODE = 'ZP';
const STATE_NAME = 'Playwright Default Test State';

type PgClient = {
  connect(): Promise<void>;
  query(sql: string, values?: unknown[]): Promise<unknown>;
  end(): Promise<void>;
};

/** `pg` belongs to the API package, so it is resolved from there. */
async function withDatabase(run: (client: PgClient) => Promise<void>): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required to deactivate a state in this spec');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const requireFromApi = createRequire(path.join(here, '../../../apps/api/package.json'));
  const { Client } = requireFromApi('pg') as {
    Client: new (config: { connectionString: string }) => PgClient;
  };
  const client = new Client({ connectionString: url.replace(/\?schema=.*$/, '') });
  await client.connect();
  try {
    await run(client);
  } finally {
    await client.end();
  }
}

const setStateActive = (isActive: boolean) =>
  withDatabase(async (db) => {
    await db.query(
      `INSERT INTO geo_states (code, name, "isActive", "createdAt", "updatedAt")
       VALUES ($1, $2, $3, now(), now())
       ON CONFLICT (code) DO UPDATE SET "isActive" = $3, "updatedAt" = now()`,
      [STATE_CODE, STATE_NAME, isActive]
    );
  });

test.describe('Settings address save keeps the default address @comprehensive @app', () => {
  test.beforeAll(() => setStateActive(true));
  test.afterAll(() =>
    withDatabase(async (db) => {
      await db.query('DELETE FROM geo_states WHERE code = $1', [STATE_CODE]);
    })
  );

  test('a refused save leaves the default address as it was, and a valid save keeps it the default', async ({
    browser,
  }) => {
    const context = await browser.newContext({ baseURL: urls.app });
    const register = await context.request.post(`${urls.api}/v1/auth/register`, {
      headers: { Origin: originForSurface('CUSTOMER') },
      data: {
        email: `default.address.${Date.now()}@tamiym.test`,
        password: e2eUsers.customer.password,
        firstName: 'Default',
        lastName: 'Address',
      },
    });
    expect(register.ok(), await register.text()).toBeTruthy();
    const csrf = (await context.cookies()).find((c) => c.name === 'ttw_customer_csrf')?.value ?? '';
    expect(csrf).not.toBe('');
    const headers = { Origin: originForSurface('CUSTOMER'), 'x-csrf-token': csrf };
    const base = { city: 'Ikeja', state: 'Lagos', country: 'Nigeria' };

    // The default address, and a second address that is not the default.
    const main = await context.request.post(`${urls.api}/v1/users/addresses`, {
      headers,
      data: { ...base, addressLine1: '1 Main Default Road', isDefault: true },
    });
    expect(main.status()).toBe(201);
    const other = await context.request.post(`${urls.api}/v1/users/addresses`, {
      headers,
      data: { ...base, addressLine1: '2 Other Road', isDefault: false },
    });
    expect(other.status()).toBe(201);
    const mainId = ((await main.json()) as { id: string }).id;
    const otherId = ((await other.json()) as { id: string }).id;

    const listAddresses = async () =>
      (await (
        await context.request.get(`${urls.api}/v1/users/addresses`, { headers })
      ).json()) as Array<{
        id: string;
        isDefault: boolean;
        addressLine1: string;
        state: string;
        stateCode: string;
        updatedAt: string;
      }>;
    const byId = (list: Awaited<ReturnType<typeof listAddresses>>, id: string) =>
      list.find((a) => a.id === id)!;
    const beforeOther = byId(await listAddresses(), otherId);

    const page = await context.newPage();
    await page.goto('/dashboard/settings');
    const state = page.getByLabel('State');
    const street = page.getByLabel('Street Address');
    await expect(state).toHaveValue('LA');
    await expect(street).toHaveValue('1 Main Default Road');
    const addressForm = street.locator('xpath=ancestor::form');
    const isAddressSave = (response: Response) =>
      response.request().method() === 'PATCH' &&
      new RegExp(`/v1/users/addresses/${mainId}$`).test(response.url());

    // The customer picks a state that is still offered, then it becomes unavailable.
    await state.selectOption({ label: STATE_NAME });
    await setStateActive(false);
    const refusedSave = page.waitForResponse(isAddressSave);
    await addressForm.getByRole('button', { name: 'Save' }).click();
    const refused = await refusedSave;
    expect(refused.status()).toBe(400);
    expect(await refused.json()).toMatchObject({ code: 'ADDRESS_STATE_UNKNOWN' });

    // Nothing changed: same two addresses, the same one is the default, still in Lagos.
    const afterRefusal = await listAddresses();
    expect(afterRefusal).toHaveLength(2);
    expect(afterRefusal.filter((a) => a.isDefault).map((a) => a.id)).toEqual([mainId]);
    expect(byId(afterRefusal, mainId)).toMatchObject({ state: 'Lagos', stateCode: 'LA' });
    expect(byId(afterRefusal, otherId)).toEqual(beforeOther);

    // The screen still shows the default address after a reload.
    await page.reload();
    await expect(state).toHaveValue('LA');
    await expect(street).toHaveValue('1 Main Default Road');

    // A valid save goes through and the address stays the default.
    await street.fill('1 Changed Default Road');
    const okSave = page.waitForResponse(isAddressSave);
    await addressForm.getByRole('button', { name: 'Save' }).click();
    const saved = await okSave;
    expect(saved.status()).toBeLessThan(300);
    const afterSave = await listAddresses();
    expect(afterSave.filter((a) => a.isDefault).map((a) => a.id)).toEqual([mainId]);
    expect(byId(afterSave, mainId).addressLine1).toBe('1 Changed Default Road');
    expect(byId(afterSave, otherId)).toEqual(beforeOther);
    await page.reload();
    await expect(street).toHaveValue('1 Changed Default Road');

    await context.close();
  });
});
