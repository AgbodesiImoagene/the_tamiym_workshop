import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { UserRole, UserStatus } from '../src/generated/prisma/client';
import { AuthSurface } from '../src/generated/prisma/enums';

const CUSTOMER_ORIGIN = 'http://localhost:3000';
const ADMIN_ORIGIN = 'http://localhost:3003';
const DISALLOWED_ORIGIN = 'http://evil.example.com';

const CUSTOMER_ACCESS_COOKIE = 'ttw_customer_access';
const CUSTOMER_REFRESH_COOKIE = 'ttw_customer_refresh';
const CUSTOMER_CSRF_COOKIE = 'ttw_customer_csrf';
const ADMIN_ACCESS_COOKIE = 'ttw_admin_access';
const ADMIN_CSRF_COOKIE = 'ttw_admin_csrf';

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

function buildCookieHeader(pairs: Record<string, string>): string {
  return Object.entries(pairs)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('; ');
}

/**
 * TTW-020: admin/customer auth surface isolation matrix.
 *
 * See docs/14-auth-and-session-architecture.md and
 * docs/decisions/ttw-020-auth-surface-isolation.md.
 *
 * NOTE: `/auth/register`, `/auth/login`, and `/auth/admin/login` are
 * throttled (3 requests/minute per IP+route). To stay well under that limit
 * while still exercising the guard pipeline through real HTTP requests, most
 * fixtures here create the user directly via Prisma and mint a session via
 * `AuthService.login` (a plain method call, not an HTTP request), then
 * attach the resulting cookies to supertest requests manually.
 */
describe('Auth surface isolation (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function createUser(role: UserRole): Promise<{
    email: string;
    password: string;
  }> {
    const email = `surface-${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const password = 'TestPassword1!';
    const passwordHash = await bcrypt.hash(password, 10);
    await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        status: UserStatus.ACTIVE,
        firstName: 'Surface',
        lastName: role,
      },
    });
    return { email, password };
  }

  /** Mint a CUSTOMER session without going through the throttled HTTP login route. */
  async function createCustomerSession(): Promise<{
    email: string;
    accessToken: string;
    refreshToken: string;
  }> {
    const { email, password } = await createUser(UserRole.CUSTOMER);
    const session = await authService.login(
      { email, password },
      AuthSurface.CUSTOMER,
    );
    return {
      email,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    };
  }

  describe('login surface enforcement', () => {
    it('POST /auth/admin/login rejects CUSTOMER credentials', async () => {
      const { email, password } = await createUser(UserRole.CUSTOMER);

      await request(app.getHttpServer())
        .post('/v1/auth/admin/login')
        .set('Origin', ADMIN_ORIGIN)
        .send({ email, password })
        .expect(401);
    });

    it('POST /auth/login rejects ADMIN credentials', async () => {
      const { email, password } = await createUser(UserRole.ADMIN);

      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .set('Origin', CUSTOMER_ORIGIN)
        .send({ email, password })
        .expect(401);
    });

    it('POST /auth/admin/login succeeds for ADMIN and sets admin-scoped cookies only', async () => {
      const { email, password } = await createUser(UserRole.ADMIN);

      const res = await request(app.getHttpServer())
        .post('/v1/auth/admin/login')
        .set('Origin', ADMIN_ORIGIN)
        .send({ email, password })
        .expect(200);

      expect(cookieValue(res, ADMIN_ACCESS_COOKIE)).toBeTruthy();
      expect(cookieValue(res, ADMIN_CSRF_COOKIE)).toBeTruthy();
      expect(cookieValue(res, CUSTOMER_ACCESS_COOKIE)).toBeFalsy();
      // Legacy shared cookie names are always cleared, never set.
      expect(cookieValue(res, 'access_token')).toBe('');
    });
  });

  describe('cross-surface cookie reuse is denied', () => {
    it('a customer session cookie is not honored on the admin Origin, but is on its own Origin', async () => {
      const session = await createCustomerSession();
      const cookieHeader = buildCookieHeader({
        [CUSTOMER_ACCESS_COOKIE]: session.accessToken,
      });

      // Same cookie, requested "from" the admin app's origin: denied.
      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Origin', ADMIN_ORIGIN)
        .set('Cookie', cookieHeader)
        .expect(401);

      // Same cookie, requested from its own (customer) origin: honored.
      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Origin', CUSTOMER_ORIGIN)
        .set('Cookie', cookieHeader)
        .expect(200);
      expect(res.body).toHaveProperty('role', 'CUSTOMER');
    });
  });

  describe('CSRF double-submit enforcement on cookie-authenticated mutations', () => {
    it('fails without an X-CSRF-Token header', async () => {
      const session = await createCustomerSession();
      const cookieHeader = buildCookieHeader({
        [CUSTOMER_ACCESS_COOKIE]: session.accessToken,
        [CUSTOMER_CSRF_COOKIE]: 'a-csrf-token',
      });

      await request(app.getHttpServer())
        .post('/v1/auth/change-password')
        .set('Origin', CUSTOMER_ORIGIN)
        .set('Cookie', cookieHeader)
        .send({
          currentPassword: 'TestPassword1!',
          newPassword: 'NewPassword123!',
        })
        .expect(403);
    });

    it('fails with a mismatched X-CSRF-Token header', async () => {
      const session = await createCustomerSession();
      const cookieHeader = buildCookieHeader({
        [CUSTOMER_ACCESS_COOKIE]: session.accessToken,
        [CUSTOMER_CSRF_COOKIE]: 'a-csrf-token',
      });

      await request(app.getHttpServer())
        .post('/v1/auth/change-password')
        .set('Origin', CUSTOMER_ORIGIN)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', 'not-the-real-token')
        .send({
          currentPassword: 'TestPassword1!',
          newPassword: 'NewPassword123!',
        })
        .expect(403);
    });

    it('fails when the Origin is outside the surface allowlist, even with a matching CSRF token', async () => {
      const session = await createCustomerSession();
      const cookieHeader = buildCookieHeader({
        [CUSTOMER_ACCESS_COOKIE]: session.accessToken,
        [CUSTOMER_CSRF_COOKIE]: 'a-csrf-token',
      });

      await request(app.getHttpServer())
        .post('/v1/auth/change-password')
        .set('Origin', DISALLOWED_ORIGIN)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', 'a-csrf-token')
        .send({
          currentPassword: 'TestPassword1!',
          newPassword: 'NewPassword123!',
        })
        // The strategy itself already rejects: the cookie extractor cannot
        // resolve a surface for this Origin, so no token is even extracted.
        .expect(401);
    });

    it('succeeds with a matching Origin and X-CSRF-Token header', async () => {
      const session = await createCustomerSession();
      const cookieHeader = buildCookieHeader({
        [CUSTOMER_ACCESS_COOKIE]: session.accessToken,
        [CUSTOMER_CSRF_COOKIE]: 'a-csrf-token',
      });

      await request(app.getHttpServer())
        .post('/v1/auth/change-password')
        .set('Origin', CUSTOMER_ORIGIN)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', 'a-csrf-token')
        .send({
          currentPassword: 'TestPassword1!',
          newPassword: 'NewPassword123!',
        })
        .expect(200);
    });

    it('is exempt for a request authenticated only by Bearer token (no surface cookie)', async () => {
      const session = await createCustomerSession();

      // No cookies at all — only the Authorization header.
      await request(app.getHttpServer())
        .post('/v1/auth/change-password')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .send({
          currentPassword: 'TestPassword1!',
          newPassword: 'NewPassword123!',
        })
        .expect(200);
    });

    it('still enforces the Origin allowlist when a surface cookie is present alongside a Bearer token', async () => {
      // "Silent bearer weakening" mitigation: even though the Authorization
      // header alone would authenticate this request, the presence of a
      // surface access cookie forces the CSRF Origin/token checks.
      const session = await createCustomerSession();
      const cookieHeader = buildCookieHeader({
        [CUSTOMER_ACCESS_COOKIE]: session.accessToken,
        [CUSTOMER_CSRF_COOKIE]: 'a-csrf-token',
      });

      await request(app.getHttpServer())
        .post('/v1/auth/change-password')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .set('Origin', DISALLOWED_ORIGIN)
        .set('Cookie', cookieHeader)
        .send({
          currentPassword: 'TestPassword1!',
          newPassword: 'NewPassword123!',
        })
        .expect(403);
    });
  });

  describe('refresh is surface-scoped', () => {
    it('rotates the customer refresh cookie and never sets an admin cookie', async () => {
      const session = await createCustomerSession();
      const cookieHeader = buildCookieHeader({
        [CUSTOMER_REFRESH_COOKIE]: session.refreshToken,
      });

      const res = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Origin', CUSTOMER_ORIGIN)
        .set('Cookie', cookieHeader)
        .expect(200);

      expect(cookieValue(res, CUSTOMER_ACCESS_COOKIE)).toBeTruthy();
      expect(cookieValue(res, ADMIN_ACCESS_COOKIE)).toBeFalsy();
    });

    it('a customer refresh token is rejected on the admin Origin', async () => {
      const session = await createCustomerSession();
      // Deliberately present the customer refresh token under the *admin*
      // cookie name to simulate a token being replayed cross-surface.
      const cookieHeader = buildCookieHeader({
        ttw_admin_refresh: session.refreshToken,
      });

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Origin', ADMIN_ORIGIN)
        .set('Cookie', cookieHeader)
        .expect(401);
    });

    it('an admin session cannot be refreshed via the customer Origin', async () => {
      const { email, password } = await createUser(UserRole.ADMIN);
      const adminRes = await request(app.getHttpServer())
        .post('/v1/auth/admin/login')
        .set('Origin', ADMIN_ORIGIN)
        .send({ email, password })
        .expect(200);
      const adminRefreshToken = cookieValue(adminRes, 'ttw_admin_refresh');
      expect(adminRefreshToken).toBeTruthy();

      // The admin refresh cookie is never sent/read under the customer
      // Origin, so there is no refresh token to rotate.
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            ttw_admin_refresh: adminRefreshToken as string,
          }),
        )
        .expect(401);
    });
  });
});
