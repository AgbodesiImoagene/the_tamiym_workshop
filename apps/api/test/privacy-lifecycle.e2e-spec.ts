import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

const CUSTOMER_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'TestPassword1!';

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

describe('Privacy lifecycle (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function registerAgent(email: string) {
    const agent = request.agent(app.getHttpServer());
    const registerRes = await agent
      .post('/v1/auth/register')
      .set('Origin', CUSTOMER_ORIGIN)
      .send({
        email,
        password: PASSWORD,
        firstName: 'Privacy',
        lastName: 'Tester',
      })
      .expect(201);
    const csrf =
      (registerRes.body.csrf_token as string) ||
      cookieValue(registerRes, 'ttw_customer_csrf') ||
      '';
    return { agent, csrf, userId: registerRes.body.user.id as string };
  }

  it('exports personal data then revokes the download', async () => {
    const email = `privacy-export-${Date.now()}@example.com`;
    const { agent, csrf } = await registerAgent(email);

    const exportRes = await agent
      .post('/v1/privacy/export')
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send({ password: PASSWORD })
      .expect(201);

    expect(exportRes.body).toMatchObject({
      type: 'EXPORT',
      status: 'COMPLETED',
    });
    expect(exportRes.body.downloadPath).toContain(exportRes.body.id);

    const downloadRes = await agent
      .post(`/v1/privacy/requests/${exportRes.body.id}/export`)
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send({ password: PASSWORD })
      .expect(200);

    expect(downloadRes.body.data.user.email).toBe(email);
    expect(downloadRes.body.checksum).toMatch(/^[a-f0-9]{64}$/);

    await agent
      .post(`/v1/privacy/requests/${exportRes.body.id}/cancel`)
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .expect(200);

    await agent
      .post(`/v1/privacy/requests/${exportRes.body.id}/export`)
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send({ password: PASSWORD })
      .expect(410);
  });

  it('erases an account, revokes access, and blocks re-login', async () => {
    const email = `privacy-erase-${Date.now()}@example.com`;
    const { agent, csrf } = await registerAgent(email);

    const eraseRes = await agent
      .post('/v1/privacy/erasure')
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send({ password: PASSWORD })
      .expect(200);

    expect(eraseRes.body).toMatchObject({
      type: 'ERASURE',
      status: 'COMPLETED',
    });
    expect(
      eraseRes.body.actions.some(
        (a: { systemCode: string }) => a.systemCode === 'postgres.sessions',
      ),
    ).toBe(true);

    await agent
      .get('/v1/privacy/requests')
      .set('Origin', CUSTOMER_ORIGIN)
      .expect(401);

    await request(app.getHttpServer())
      .post('/v1/auth/login')
      .set('Origin', CUSTOMER_ORIGIN)
      .send({ email, password: PASSWORD })
      .expect(401);
  });

  it('does not allow one user to download another user export', async () => {
    const a = await registerAgent(`privacy-a-${Date.now()}@example.com`);
    const b = await registerAgent(`privacy-b-${Date.now()}@example.com`);

    const exportRes = await a.agent
      .post('/v1/privacy/export')
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', a.csrf)
      .send({ password: PASSWORD })
      .expect(201);

    await b.agent
      .post(`/v1/privacy/requests/${exportRes.body.id}/export`)
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', b.csrf)
      .send({ password: PASSWORD })
      .expect(404);
  });
});
