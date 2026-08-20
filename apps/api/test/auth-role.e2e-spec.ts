import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

/** Extract a cookie value by name from a supertest response's Set-Cookie headers. */
function cookieValue(res: Response, name: string): string | undefined {
  const setCookie = res.headers['set-cookie'];
  const cookies: string[] = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  for (const raw of cookies) {
    const [pair] = raw.split(';');
    const [key, value] = pair.split('=');
    if (key === name) return decodeURIComponent(value ?? '');
  }
  return undefined;
}

/**
 * Integration tests: customers cannot access organizer-only or admin-only routes.
 * Registration must not accept role (all self-signups are CUSTOMER).
 */
describe('Auth and role boundaries (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  it('register creates CUSTOMER only (no role in body)', async () => {
    const email = `customer-${Date.now()}@example.com`;
    const res = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email,
        password: 'TestPassword1!',
        firstName: 'Test',
        lastName: 'Customer',
      })
      .expect(201);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toHaveProperty('role', 'CUSTOMER');
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('customer cannot access admin list orders', async () => {
    const email = `cust-admin-${Date.now()}@example.com`;
    const agent = request.agent(app.getHttpServer());
    // TTW-020: cookie auth is surface-scoped; the customer origin must be
    // present for the customer access cookie to be read by the JWT strategy.
    await agent
      .post('/v1/auth/register')
      .set('Origin', 'http://localhost:3000')
      .send({
        email,
        password: 'TestPassword1!',
        firstName: 'Test',
        lastName: 'User',
      })
      .expect(201);
    await agent
      .get('/v1/admin/orders')
      .set('Origin', 'http://localhost:3000')
      .expect(403);
  });

  it('customer cannot create campaign (organizer only)', async () => {
    const email = `cust-campaign-${Date.now()}@example.com`;
    const agent = request.agent(app.getHttpServer());
    const registerRes = await agent
      .post('/v1/auth/register')
      .set('Origin', 'http://localhost:3000')
      .send({
        email,
        password: 'TestPassword1!',
        firstName: 'Test',
        lastName: 'User',
      })
      .expect(201);
    // Satisfy CSRF (Origin allowlist + double-submit token) so this request
    // is rejected for the role, not for a missing/invalid CSRF token. The
    // token comes from the response body, the way a cross-origin SPA gets it
    // (TTW-020); it must equal the cookie the browser will send back.
    const csrfToken = registerRes.body.csrf_token as string;
    expect(csrfToken).toBe(cookieValue(registerRes, 'ttw_customer_csrf'));
    await agent
      .post('/v1/campaigns')
      .set('Origin', 'http://localhost:3000')
      .set('x-csrf-token', csrfToken ?? '')
      .send({ title: 'Test Campaign' })
      .expect(403);
  });
});
