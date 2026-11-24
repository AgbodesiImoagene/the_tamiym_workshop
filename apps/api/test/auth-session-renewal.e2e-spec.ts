import { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { UserRole, UserStatus } from '../src/generated/prisma/client';
import { AuthSurface } from '../src/generated/prisma/enums';
import { hashRefreshToken } from '../src/auth/auth-session.crypto';
import { AUTH_RATE_LIMIT_KEY_PREFIX } from '../src/auth/auth-rate-limit';
import { AUTH_RATE_LIMIT_BUCKETS } from '../src/constants';

const CUSTOMER_ORIGIN = 'http://localhost:3000';
const ADMIN_ORIGIN = 'http://localhost:3003';
const DISALLOWED_ORIGIN = 'http://evil.example.com';

const CUSTOMER_ACCESS_COOKIE = 'ttw_customer_access';
const CUSTOMER_REFRESH_COOKIE = 'ttw_customer_refresh';
const CUSTOMER_CSRF_COOKIE = 'ttw_customer_csrf';
const ADMIN_REFRESH_COOKIE = 'ttw_admin_refresh';
const ADMIN_CSRF_COOKIE = 'ttw_admin_csrf';

/** Any CSRF token value works: the guard only compares cookie against header. */
const CSRF_TOKEN = 'ab12'.repeat(16);

function setCookieValue(res: Response, name: string): string | undefined {
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

function cookieHeader(pairs: Record<string, string>): string {
  return Object.entries(pairs)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('; ');
}

/** The IP counters are shared by every suite that runs from the same address. */
async function resetIpCounters(buckets: string[]) {
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 0),
    maxRetriesPerRequest: 1,
  });
  try {
    for (const bucket of buckets) {
      const keys = await redis.keys(
        `${AUTH_RATE_LIMIT_KEY_PREFIX}:*:${bucket}:*`,
      );
      if (keys.length > 0) await redis.del(...keys);
    }
  } finally {
    redis.disconnect();
  }
}

/**
 * TTW-262: renewing a customer session without signing the person out.
 * `POST /auth/refresh` keeps the CSRF token, `GET /auth/csrf` hands it back to
 * a tab that lost it, and both are rate limited.
 */
describe('Auth session renewal (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);
    await resetIpCounters(['session_refresh', 'csrf_token']);
  });

  afterAll(async () => {
    await resetIpCounters(['session_refresh', 'csrf_token']);
    await closeE2eApp(app);
  });

  async function createCustomerSession(): Promise<{
    accessToken: string;
    refreshToken: string;
  }> {
    const email = `renew-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const password = 'TestPassword1!';
    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Renew',
        lastName: 'Customer',
      },
    });
    const session = await authService.login(
      { email, password },
      AuthSurface.CUSTOMER,
    );
    return {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    };
  }

  async function refreshTokenIsLive(token: string): Promise<boolean> {
    const record = await prisma.authSession.findUnique({
      where: { refreshTokenHash: hashRefreshToken(token) },
    });
    return (
      record !== null &&
      record.revokedAt === null &&
      record.expiresAt > new Date()
    );
  }

  describe('POST /auth/refresh keeps the CSRF token', () => {
    it('answers with, and sets again, the CSRF value the browser already holds', async () => {
      const session = await createCustomerSession();

      const res = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          cookieHeader({
            [CUSTOMER_REFRESH_COOKIE]: session.refreshToken,
            [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
          }),
        )
        .set('x-csrf-token', CSRF_TOKEN)
        .expect(200);

      expect(res.body.csrf_token).toBe(CSRF_TOKEN);
      expect(setCookieValue(res, CUSTOMER_CSRF_COOKIE)).toBe(CSRF_TOKEN);
      // The access and refresh tokens are still renewed.
      expect(setCookieValue(res, CUSTOMER_ACCESS_COOKIE)).toBeTruthy();
      expect(setCookieValue(res, CUSTOMER_REFRESH_COOKIE)).not.toBe(
        session.refreshToken,
      );
      expect(await refreshTokenIsLive(session.refreshToken)).toBe(false);
    });

    it('replaces a malformed CSRF cookie instead of keeping it', async () => {
      const session = await createCustomerSession();
      const res = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          cookieHeader({
            [CUSTOMER_REFRESH_COOKIE]: session.refreshToken,
            [CUSTOMER_CSRF_COOKIE]: 'planted',
          }),
        )
        .set('x-csrf-token', 'planted')
        .expect(200);
      expect(res.body.csrf_token).toMatch(/^[0-9a-f]{64}$/);
      expect(setCookieValue(res, CUSTOMER_CSRF_COOKIE)).toBe(
        res.body.csrf_token,
      );
    });

    it('still mints a CSRF token for a body-only client that has no cookie', async () => {
      const session = await createCustomerSession();

      const res = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refresh_token: session.refreshToken })
        .expect(200);

      expect(res.body.csrf_token).toEqual(expect.any(String));
      expect(res.body.csrf_token.length).toBeGreaterThan(20);
      expect(res.body.csrf_token).not.toBe(CSRF_TOKEN);
    });

    it('refuses a refresh token that was already rotated', async () => {
      const session = await createCustomerSession();
      const send = () =>
        request(app.getHttpServer())
          .post('/v1/auth/refresh')
          .set('Origin', CUSTOMER_ORIGIN)
          .set(
            'Cookie',
            cookieHeader({
              [CUSTOMER_REFRESH_COOKIE]: session.refreshToken,
              [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
            }),
          )
          .set('x-csrf-token', CSRF_TOKEN);

      await send().expect(200);
      await send().expect(401);
    });

    it('refuses a refresh with no refresh token at all', async () => {
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Origin', CUSTOMER_ORIGIN)
        .expect(401);
    });

    it('with two parallel refreshes on one token, only one wins', async () => {
      const session = await createCustomerSession();
      const send = () =>
        request(app.getHttpServer())
          .post('/v1/auth/refresh')
          .set('Origin', CUSTOMER_ORIGIN)
          .set(
            'Cookie',
            cookieHeader({
              [CUSTOMER_REFRESH_COOKIE]: session.refreshToken,
              [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
            }),
          )
          .set('x-csrf-token', CSRF_TOKEN);

      const results = await Promise.all([send(), send()]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
    });
  });

  describe('GET /auth/csrf', () => {
    it('returns only the CSRF token already held, and is never cacheable', async () => {
      const session = await createCustomerSession();

      const res = await request(app.getHttpServer())
        .get('/v1/auth/csrf')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          cookieHeader({
            [CUSTOMER_REFRESH_COOKIE]: session.refreshToken,
            [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
          }),
        )
        .expect(200);

      expect(res.body).toEqual({ csrf_token: CSRF_TOKEN });
      expect(res.headers['cache-control']).toMatch(/no-store/);
      // It reads, it does not rotate anything.
      expect(setCookieValue(res, CUSTOMER_REFRESH_COOKIE)).toBeUndefined();
      expect(await refreshTokenIsLive(session.refreshToken)).toBe(true);
    });

    it('works with an expired or access-only cookie: any surface session cookie is enough', async () => {
      const session = await createCustomerSession();

      const res = await request(app.getHttpServer())
        .get('/v1/auth/csrf')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          cookieHeader({
            [CUSTOMER_ACCESS_COOKIE]: session.accessToken,
            [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
          }),
        )
        .expect(200);

      expect(res.body).toEqual({ csrf_token: CSRF_TOKEN });
    });

    it('mints and sets a token when the session has none yet', async () => {
      const session = await createCustomerSession();

      const res = await request(app.getHttpServer())
        .get('/v1/auth/csrf')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          cookieHeader({ [CUSTOMER_REFRESH_COOKIE]: session.refreshToken }),
        )
        .expect(200);

      expect(res.body.csrf_token).toEqual(expect.any(String));
      expect(res.body.csrf_token.length).toBeGreaterThan(20);
      expect(setCookieValue(res, CUSTOMER_CSRF_COOKIE)).toBe(
        res.body.csrf_token,
      );
    });

    it('answers 401 with no session cookie at all', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/auth/csrf')
        .set('Origin', CUSTOMER_ORIGIN)
        .expect(401);
      expect(res.body.csrf_token).toBeUndefined();
    });

    it('answers 401 with only a CSRF cookie: that is not a session', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/auth/csrf')
        .set('Origin', CUSTOMER_ORIGIN)
        .set('Cookie', cookieHeader({ [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN }))
        .expect(401);
      expect(JSON.stringify(res.body)).not.toContain(CSRF_TOKEN);
    });

    it('answers 401 when the Origin is missing or not allowlisted', async () => {
      const session = await createCustomerSession();
      const cookies = cookieHeader({
        [CUSTOMER_REFRESH_COOKIE]: session.refreshToken,
        [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
      });

      await request(app.getHttpServer())
        .get('/v1/auth/csrf')
        .set('Cookie', cookies)
        .expect(401);
      const res = await request(app.getHttpServer())
        .get('/v1/auth/csrf')
        .set('Origin', DISALLOWED_ORIGIN)
        .set('Cookie', cookies)
        .expect(401);
      expect(JSON.stringify(res.body)).not.toContain(CSRF_TOKEN);
    });

    it('never hands a customer token to the admin surface, nor an admin token to the customer one', async () => {
      const session = await createCustomerSession();

      await request(app.getHttpServer())
        .get('/v1/auth/csrf')
        .set('Origin', ADMIN_ORIGIN)
        .set(
          'Cookie',
          cookieHeader({
            [CUSTOMER_REFRESH_COOKIE]: session.refreshToken,
            [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
          }),
        )
        .expect(401);

      await request(app.getHttpServer())
        .get('/v1/auth/csrf')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          cookieHeader({
            [ADMIN_REFRESH_COOKIE]: 'an-admin-refresh-token',
            [ADMIN_CSRF_COOKIE]: CSRF_TOKEN,
          }),
        )
        .expect(401);
    });
  });

  describe('rate limits', () => {
    it('limits POST /auth/refresh per session cookie, above normal use', async () => {
      const limit = AUTH_RATE_LIMIT_BUCKETS.session_refresh.identityLimit;
      expect(limit).toBeGreaterThanOrEqual(20);
      const cookies = cookieHeader({
        [CUSTOMER_REFRESH_COOKIE]: `not-a-real-token-${Date.now()}`,
        [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
      });
      const send = () =>
        request(app.getHttpServer())
          .post('/v1/auth/refresh')
          .set('Origin', CUSTOMER_ORIGIN)
          .set('Cookie', cookies)
          .set('x-csrf-token', CSRF_TOKEN);

      for (let i = 0; i < limit; i += 1) {
        await send().expect(401);
      }
      await send().expect(429);
    });

    it('a random body field cannot buy a fresh refresh identity', async () => {
      const limit = AUTH_RATE_LIMIT_BUCKETS.session_refresh.identityLimit;
      const cookies = cookieHeader({
        [CUSTOMER_REFRESH_COOKIE]: `body-field-token-${Date.now()}`,
        [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
      });
      const send = (n: number) =>
        request(app.getHttpServer())
          .post('/v1/auth/refresh')
          .set('Origin', CUSTOMER_ORIGIN)
          .set('Cookie', cookies)
          .set('x-csrf-token', CSRF_TOKEN)
          .send({ token: `random-${n}` });
      for (let i = 0; i < limit; i += 1) await send(i).expect(401);
      await send(limit).expect(429);
    });

    it('does not let one person use up the refresh budget of another', async () => {
      const other = cookieHeader({
        [CUSTOMER_REFRESH_COOKIE]: `another-token-${Date.now()}`,
        [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
      });
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Origin', CUSTOMER_ORIGIN)
        .set('Cookie', other)
        .set('x-csrf-token', CSRF_TOKEN)
        .expect(401);
    });

    it('limits GET /auth/csrf per session cookie', async () => {
      const limit = AUTH_RATE_LIMIT_BUCKETS.csrf_token.identityLimit;
      const cookies = cookieHeader({
        [CUSTOMER_REFRESH_COOKIE]: `csrf-limit-token-${Date.now()}`,
        [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
      });
      const send = () =>
        request(app.getHttpServer())
          .get('/v1/auth/csrf')
          .set('Origin', CUSTOMER_ORIGIN)
          .set('Cookie', cookies);

      for (let i = 0; i < limit; i += 1) {
        await send().expect(200);
      }
      await send().expect(429);
    });
  });
});
