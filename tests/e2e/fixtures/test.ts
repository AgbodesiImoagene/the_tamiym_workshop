import {
  test as base,
  expect,
  type Page,
  type APIRequestContext,
  type BrowserContext,
} from '@playwright/test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiContext } from './api';
import { e2eUsers, urls } from './identities';
import { paystackSimulator } from './paystack-simulator';

const authDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../.auth');

const FIRST_PARTY_HOSTS = new Set(
  [urls.api, urls.web, urls.app, urls.admin].map((value) => new URL(value).host)
);

/**
 * Strategy: unexpected console/page errors and failed first-party requests fail the test.
 * Returns an assertion to run before disposing the page/context.
 */
export function attachStrictPageGuards(page: Page): () => void {
  const failures: string[] = [];

  page.on('pageerror', (error) => {
    failures.push(`Unhandled page error: ${error.message}`);
  });
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    const text = msg.text();
    if (text.includes('Download the React DevTools')) return;
    failures.push(`Unexpected console error: ${text}`);
  });
  page.on('requestfailed', (request) => {
    let host = '';
    try {
      host = new URL(request.url()).host;
    } catch {
      return;
    }
    if (!FIRST_PARTY_HOSTS.has(host)) return;
    const failure = request.failure()?.errorText ?? 'unknown';
    if (failure.includes('net::ERR_ABORTED')) return;
    failures.push(`First-party request failed: ${request.method()} ${request.url()} (${failure})`);
  });

  return () => {
    expect(failures, failures.join('\n')).toEqual([]);
  };
}

async function newGuardedPage(
  context: BrowserContext
): Promise<{ page: Page; assertClean: () => void }> {
  const page = await context.newPage();
  const assertClean = attachStrictPageGuards(page);
  return { page, assertClean };
}

type Fixtures = {
  api: APIRequestContext;
  customerPage: Page;
  organiserPage: Page;
  adminPage: Page;
  paystack: typeof paystackSimulator;
};

/**
 * Extended test with isolated role contexts. Since TTW-020 each surface has
 * its own cookie names on the API host, and the saved storage states carry
 * surface-scoped cookies — so a context must always be used against the
 * matching surface's Origin.
 */
export const test = base.extend<Fixtures>({
  api: async ({}, use) => {
    const api = await createApiContext();
    await use(api);
    await api.dispose();
  },
  customerPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      baseURL: urls.app,
      storageState: path.join(authDir, 'customer.json'),
    });
    const { page, assertClean } = await newGuardedPage(context);
    await use(page);
    assertClean();
    await context.close();
  },
  organiserPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      baseURL: urls.app,
      storageState: path.join(authDir, 'organiser.json'),
    });
    const { page, assertClean } = await newGuardedPage(context);
    await use(page);
    assertClean();
    await context.close();
  },
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      baseURL: urls.admin,
      storageState: path.join(authDir, 'admin.json'),
    });
    const { page, assertClean } = await newGuardedPage(context);
    await use(page);
    assertClean();
    await context.close();
  },
  paystack: async ({}, use) => {
    paystackSimulator.reset();
    await use(paystackSimulator);
    paystackSimulator.reset();
  },
});

export { expect, e2eUsers, urls };
