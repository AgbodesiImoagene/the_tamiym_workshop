import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService, isMfaChallengeResponse } from '../src/auth/auth.service';
import { UserRole, UserStatus } from '../src/generated/prisma/client';
import { AuthSurface } from '../src/generated/prisma/enums';
import { hashRefreshToken } from '../src/auth/auth-session.crypto';
import { generateTotpCode } from '../src/auth/admin-mfa.totp';

const CUSTOMER_ORIGIN = 'http://localhost:3000';
const ADMIN_ORIGIN = 'http://localhost:3003';
const DISALLOWED_ORIGIN = 'http://evil.example.com';

const CUSTOMER_ACCESS_COOKIE = 'ttw_customer_access';
const CUSTOMER_REFRESH_COOKIE = 'ttw_customer_refresh';
const CUSTOMER_CSRF_COOKIE = 'ttw_customer_csrf';
const ADMIN_ACCESS_COOKIE = 'ttw_admin_access';
const ADMIN_REFRESH_COOKIE = 'ttw_admin_refresh';
const ADMIN_CSRF_COOKIE = 'ttw_admin_csrf';

/** Any CSRF token value works: the guard only compares cookie against header. */
const CSRF_TOKEN = 'a-csrf-token';

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
  let jwtService: JwtService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);
    jwtService = app.get(JwtService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function createUser(role: UserRole): Promise<{
    id: string;
    email: string;
    password: string;
  }> {
    const email = `surface-${role.toLowerCase()}-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const password = 'TestPassword1!';
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role,
        status: UserStatus.ACTIVE,
        firstName: 'Surface',
        lastName: role,
        // ORGANIZER/ADMIN auth requires verification (TTW-023).
        emailVerifiedAt:
          role === UserRole.ADMIN || role === UserRole.ORGANIZER
            ? new Date()
            : null,
      },
    });
    return { id: user.id, email, password };
  }

  /** Mint a CUSTOMER session without going through the throttled HTTP login route. */
  async function createCustomerSession(): Promise<{
    id: string;
    email: string;
    accessToken: string;
    refreshToken: string;
  }> {
    const { id, email, password } = await createUser(UserRole.CUSTOMER);
    const session = await authService.login(
      { email, password },
      AuthSurface.CUSTOMER,
    );
    return {
      id,
      email,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    };
  }

  /** Mint an ADMIN session (password → MFA enroll/confirm → session). */
  async function createAdminSession(): Promise<{
    id: string;
    email: string;
    accessToken: string;
    refreshToken: string;
  }> {
    const { id, email, password } = await createUser(UserRole.ADMIN);
    const challenge = await authService.login(
      { email, password },
      AuthSurface.ADMIN,
    );
    if (!isMfaChallengeResponse(challenge)) {
      throw new Error('expected MFA enrollment challenge for new admin');
    }
    const enrollment = await authService.adminMfaEnrollStart(
      challenge.mfa_token,
    );
    const totp = generateTotpCode(enrollment.secret);
    const session = await authService.adminMfaEnrollConfirm(
      challenge.mfa_token,
      totp,
    );
    return {
      id,
      email,
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
    };
  }

  async function refreshTokenExists(token: string): Promise<boolean> {
    const record = await prisma.authSession.findUnique({
      where: { refreshTokenHash: hashRefreshToken(token) },
    });
    return (
      record !== null &&
      record.revokedAt === null &&
      record.expiresAt > new Date()
    );
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

    it('POST /auth/admin/login returns MFA enrollment challenge without cookies', async () => {
      const { email, password } = await createUser(UserRole.ADMIN);

      const res = await request(app.getHttpServer())
        .post('/v1/auth/admin/login')
        .set('Origin', ADMIN_ORIGIN)
        .send({ email, password })
        .expect(200);

      expect(res.body.mfa.status).toBe('ENROLLMENT_REQUIRED');
      expect(typeof res.body.mfa_token).toBe('string');
      expect(cookieValue(res, ADMIN_ACCESS_COOKIE)).toBeFalsy();
      expect(cookieValue(res, CUSTOMER_ACCESS_COOKIE)).toBeFalsy();
    });

    it('POST /auth/admin/mfa enroll confirm issues admin-scoped cookies only', async () => {
      const { email, password } = await createUser(UserRole.ADMIN);

      const loginRes = await request(app.getHttpServer())
        .post('/v1/auth/admin/login')
        .set('Origin', ADMIN_ORIGIN)
        .send({ email, password })
        .expect(200);

      const enrollRes = await request(app.getHttpServer())
        .post('/v1/auth/admin/mfa/enroll/start')
        .set('Origin', ADMIN_ORIGIN)
        .send({ mfa_token: loginRes.body.mfa_token })
        .expect(200);

      expect(enrollRes.body.otpauth_uri).toMatch(/^otpauth:\/\//);
      expect(enrollRes.body.recovery_codes).toHaveLength(10);

      const confirmRes = await request(app.getHttpServer())
        .post('/v1/auth/admin/mfa/enroll/confirm')
        .set('Origin', ADMIN_ORIGIN)
        .send({
          mfa_token: loginRes.body.mfa_token,
          totp: generateTotpCode(enrollRes.body.secret),
        })
        .expect(200);

      expect(cookieValue(confirmRes, ADMIN_ACCESS_COOKIE)).toBeTruthy();
      expect(cookieValue(confirmRes, ADMIN_CSRF_COOKIE)).toBeTruthy();
      expect(cookieValue(confirmRes, CUSTOMER_ACCESS_COOKIE)).toBeFalsy();
      expect(cookieValue(confirmRes, 'access_token')).toBe('');
      expect(confirmRes.body.csrf_token).toBe(
        cookieValue(confirmRes, ADMIN_CSRF_COOKIE),
      );
    });

    it('POST /auth/admin/mfa/challenge issues session after enroll', async () => {
      // Enroll + mint challenge token via service; only the challenge route
      // is exercised over HTTP (shared IP throttle is 3/min on admin login).
      const { email, password } = await createUser(UserRole.ADMIN);
      const enrollChallenge = await authService.login(
        { email, password },
        AuthSurface.ADMIN,
      );
      if (!isMfaChallengeResponse(enrollChallenge)) {
        throw new Error('expected MFA enrollment challenge');
      }
      const enrollment = await authService.adminMfaEnrollStart(
        enrollChallenge.mfa_token,
      );
      await authService.adminMfaEnrollConfirm(
        enrollChallenge.mfa_token,
        generateTotpCode(enrollment.secret),
      );

      const loginChallenge = await authService.login(
        { email, password },
        AuthSurface.ADMIN,
      );
      if (!isMfaChallengeResponse(loginChallenge)) {
        throw new Error('expected MFA challenge');
      }
      expect(loginChallenge.mfa.status).toBe('CHALLENGE_REQUIRED');

      const challengeRes = await request(app.getHttpServer())
        .post('/v1/auth/admin/mfa/challenge')
        .set('Origin', ADMIN_ORIGIN)
        .send({
          mfa_token: loginChallenge.mfa_token,
          totp: generateTotpCode(enrollment.secret),
        })
        .expect(200);

      expect(cookieValue(challengeRes, ADMIN_ACCESS_COOKIE)).toBeTruthy();
      expect(challengeRes.body.csrf_token).toEqual(expect.any(String));
    });

    it('POST /auth/admin/mfa/recover consumes a code once then denies replay', async () => {
      const { email, password } = await createUser(UserRole.ADMIN);
      const enrollChallenge = await authService.login(
        { email, password },
        AuthSurface.ADMIN,
      );
      if (!isMfaChallengeResponse(enrollChallenge)) {
        throw new Error('expected MFA enrollment challenge');
      }
      const enrollment = await authService.adminMfaEnrollStart(
        enrollChallenge.mfa_token,
      );
      const recoveryCode = enrollment.recovery_codes[0];
      await authService.adminMfaEnrollConfirm(
        enrollChallenge.mfa_token,
        generateTotpCode(enrollment.secret),
      );

      const loginChallenge = await authService.login(
        { email, password },
        AuthSurface.ADMIN,
      );
      if (!isMfaChallengeResponse(loginChallenge)) {
        throw new Error('expected MFA challenge');
      }

      const recoverRes = await request(app.getHttpServer())
        .post('/v1/auth/admin/mfa/recover')
        .set('Origin', ADMIN_ORIGIN)
        .send({
          mfa_token: loginChallenge.mfa_token,
          recovery_code: recoveryCode,
        })
        .expect(200);

      expect(cookieValue(recoverRes, ADMIN_ACCESS_COOKIE)).toBeTruthy();

      const again = await authService.login(
        { email, password },
        AuthSurface.ADMIN,
      );
      if (!isMfaChallengeResponse(again)) {
        throw new Error('expected MFA challenge after recover');
      }

      await request(app.getHttpServer())
        .post('/v1/auth/admin/mfa/recover')
        .set('Origin', ADMIN_ORIGIN)
        .send({
          mfa_token: again.mfa_token,
          recovery_code: recoveryCode,
        })
        .expect(401);
    });
  });

  describe('CSRF token transport', () => {
    it('GET /auth/me echoes the existing session CSRF cookie', async () => {
      const session = await createCustomerSession();

      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            [CUSTOMER_ACCESS_COOKIE]: session.accessToken,
            [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
          }),
        )
        .expect(200);

      expect(res.body.csrf_token).toBe(CSRF_TOKEN);
      // No re-mint, so parallel tabs keep the token they already stored.
      expect(cookieValue(res, CUSTOMER_CSRF_COOKIE)).toBeUndefined();
    });

    it('GET /auth/me mints a CSRF token for a cookie session that has none', async () => {
      const session = await createCustomerSession();

      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            [CUSTOMER_ACCESS_COOKIE]: session.accessToken,
          }),
        )
        .expect(200);

      expect(res.body.csrf_token).toEqual(expect.any(String));
      expect(cookieValue(res, CUSTOMER_CSRF_COOKIE)).toBe(res.body.csrf_token);
    });

    it('GET /auth/me omits csrf_token for a bearer-only caller', async () => {
      const session = await createCustomerSession();

      const res = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Authorization', `Bearer ${session.accessToken}`)
        .expect(200);

      expect(res.body.csrf_token).toBeUndefined();
    });

    it('a CSRF token taken from the login body is accepted on a mutation', async () => {
      const session = await createAdminSession();
      const meRes = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Origin', ADMIN_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            [ADMIN_ACCESS_COOKIE]: session.accessToken,
          }),
        )
        .expect(200);

      const bodyCsrfToken = meRes.body.csrf_token as string;
      const { password } = await prisma.user
        .findUniqueOrThrow({ where: { id: session.id } })
        .then(() => ({ password: 'TestPassword1!' }));

      await request(app.getHttpServer())
        .post('/v1/auth/change-password')
        .set('Origin', ADMIN_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            [ADMIN_ACCESS_COOKIE]: session.accessToken,
            [ADMIN_CSRF_COOKIE]: bodyCsrfToken,
          }),
        )
        .set('x-csrf-token', bodyCsrfToken)
        .send({ currentPassword: password, newPassword: 'NewPassword123!' })
        .expect(200);
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
        [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
      });

      const res = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Origin', CUSTOMER_ORIGIN)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', CSRF_TOKEN)
        .expect(200);

      expect(cookieValue(res, CUSTOMER_ACCESS_COOKIE)).toBeTruthy();
      expect(cookieValue(res, ADMIN_ACCESS_COOKIE)).toBeFalsy();
      // The rotated session's CSRF token comes back in the body.
      expect(res.body.csrf_token).toBe(cookieValue(res, CUSTOMER_CSRF_COOKIE));
    });

    it('a customer refresh token is rejected on the admin Origin', async () => {
      const session = await createCustomerSession();
      // Deliberately present the customer refresh token under the *admin*
      // cookie name to simulate a token being replayed cross-surface.
      const cookieHeader = buildCookieHeader({
        [ADMIN_REFRESH_COOKIE]: session.refreshToken,
        [ADMIN_CSRF_COOKIE]: CSRF_TOKEN,
      });

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Origin', ADMIN_ORIGIN)
        .set('Cookie', cookieHeader)
        .set('x-csrf-token', CSRF_TOKEN)
        .expect(401);
    });

    it('an admin session cannot be refreshed via the customer Origin', async () => {
      const session = await createAdminSession();

      // Admin cookies presented from the customer Origin: the surface the
      // Origin resolves to is not the surface holding cookies, so the request
      // is refused before any rotation is attempted.
      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            [ADMIN_REFRESH_COOKIE]: session.refreshToken,
            [ADMIN_CSRF_COOKIE]: CSRF_TOKEN,
          }),
        )
        .set('x-csrf-token', CSRF_TOKEN)
        .expect(403);

      expect(await refreshTokenExists(session.refreshToken)).toBe(true);
    });

    it('accepts a body-only refresh_token with no cookies (non-browser client)', async () => {
      const session = await createCustomerSession();

      const res = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .send({ refresh_token: session.refreshToken })
        .expect(200);

      expect(res.body.csrf_token).toEqual(expect.any(String));
      expect(await refreshTokenExists(session.refreshToken)).toBe(false);
    });
  });

  describe('CSRF is enforced on the public refresh/logout routes', () => {
    it('refresh with session cookies but no CSRF header is rejected and rotates nothing', async () => {
      const session = await createCustomerSession();

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            [CUSTOMER_REFRESH_COOKIE]: session.refreshToken,
            [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
          }),
        )
        .expect(403);

      expect(await refreshTokenExists(session.refreshToken)).toBe(true);
    });

    it('cross-site refresh with session cookies is rejected and clears no cookies', async () => {
      const session = await createCustomerSession();

      const res = await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set('Origin', DISALLOWED_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            [CUSTOMER_REFRESH_COOKIE]: session.refreshToken,
            [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
          }),
        )
        .set('x-csrf-token', CSRF_TOKEN)
        .expect(403);

      // Nothing is set or expired, so a cross-site page cannot force the
      // other surface's cookies to be cleared either.
      expect(res.headers['set-cookie']).toBeUndefined();
      expect(await refreshTokenExists(session.refreshToken)).toBe(true);
    });

    it('refresh with session cookies but no Origin at all is rejected', async () => {
      const session = await createCustomerSession();

      await request(app.getHttpServer())
        .post('/v1/auth/refresh')
        .set(
          'Cookie',
          buildCookieHeader({
            [CUSTOMER_REFRESH_COOKIE]: session.refreshToken,
            [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
          }),
        )
        .set('x-csrf-token', CSRF_TOKEN)
        .expect(403);

      expect(await refreshTokenExists(session.refreshToken)).toBe(true);
    });

    it('cross-site logout does not revoke the session', async () => {
      const session = await createCustomerSession();

      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Origin', DISALLOWED_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            [CUSTOMER_REFRESH_COOKIE]: session.refreshToken,
            [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
          }),
        )
        .set('x-csrf-token', CSRF_TOKEN)
        .expect(403);

      expect(await refreshTokenExists(session.refreshToken)).toBe(true);
    });

    it('logout with session cookies but no CSRF header does not revoke the session', async () => {
      const session = await createCustomerSession();

      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            [CUSTOMER_REFRESH_COOKIE]: session.refreshToken,
            [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
          }),
        )
        .expect(403);

      expect(await refreshTokenExists(session.refreshToken)).toBe(true);
    });

    it('logout with a matching Origin + CSRF token revokes only that surface', async () => {
      const customer = await createCustomerSession();
      const admin = await createAdminSession();

      const res = await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            [CUSTOMER_REFRESH_COOKIE]: customer.refreshToken,
            [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
          }),
        )
        .set('x-csrf-token', CSRF_TOKEN)
        .expect(200);

      expect(await refreshTokenExists(customer.refreshToken)).toBe(false);
      // The admin surface is untouched: neither revoked nor cleared.
      expect(await refreshTokenExists(admin.refreshToken)).toBe(true);
      expect(cookieValue(res, CUSTOMER_ACCESS_COOKIE)).toBe('');
      expect(cookieValue(res, ADMIN_ACCESS_COOKIE)).toBeUndefined();
    });

    it('logout cannot revoke a refresh token belonging to the other surface', async () => {
      const admin = await createAdminSession();

      // An admin refresh token replayed under the customer cookie name, from
      // the customer Origin with a valid customer CSRF pair.
      await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            [CUSTOMER_REFRESH_COOKIE]: admin.refreshToken,
            [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
          }),
        )
        .set('x-csrf-token', CSRF_TOKEN)
        .expect(200);

      expect(await refreshTokenExists(admin.refreshToken)).toBe(true);
    });
  });

  describe('bearer tokens carry and enforce their surface', () => {
    it('rejects an ADMIN-surface bearer token minted for a CUSTOMER-role account', async () => {
      const { id, email } = await createUser(UserRole.CUSTOMER);
      // Forge what an attacker (or a stale/mis-issued token) would present:
      // AuthService.login refuses this combination, so sign it directly.
      const forged = jwtService.sign({
        sub: id,
        email,
        role: UserRole.ADMIN,
        surface: AuthSurface.ADMIN,
        sid: 'forged-session',
      });

      await request(app.getHttpServer())
        .get('/v1/admin/orders')
        .set('Authorization', `Bearer ${forged}`)
        .expect(401);
    });

    it('rejects a CUSTOMER-surface session once the account becomes ADMIN', async () => {
      const session = await createCustomerSession();
      await prisma.user.update({
        where: { id: session.id },
        data: { role: UserRole.ADMIN },
      });

      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            [CUSTOMER_ACCESS_COOKIE]: session.accessToken,
          }),
        )
        .expect(401);
    });
  });

  describe('hashed session list and revoke (TTW-023)', () => {
    it('lists sessions and marks the current one', async () => {
      const session = await createCustomerSession();
      // Second same-surface session (multi-device).
      const second = await authService.login(
        {
          email: (
            await prisma.user.findUniqueOrThrow({ where: { id: session.id } })
          ).email,
          password: 'TestPassword1!',
        },
        AuthSurface.CUSTOMER,
      );

      const res = await request(app.getHttpServer())
        .get('/v1/auth/sessions')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            [CUSTOMER_ACCESS_COOKIE]: second.access_token,
          }),
        )
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThanOrEqual(2);
      expect(
        res.body.every((row: { refreshToken?: string }) => !row.refreshToken),
      ).toBe(true);
      const current = res.body.find(
        (row: { current: boolean }) => row.current === true,
      );
      expect(current).toBeDefined();
    });

    it('revokes one other session without killing the current access JWT immediately if that session differs', async () => {
      const first = await createCustomerSession();
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: first.id },
      });
      const second = await authService.login(
        { email: user.email, password: 'TestPassword1!' },
        AuthSurface.CUSTOMER,
      );

      const listed = await request(app.getHttpServer())
        .get('/v1/auth/sessions')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            [CUSTOMER_ACCESS_COOKIE]: second.access_token,
          }),
        )
        .expect(200);

      const other = listed.body.find(
        (row: { current: boolean; id: string }) => !row.current,
      );
      expect(other).toBeDefined();

      await request(app.getHttpServer())
        .delete(`/v1/auth/sessions/${other.id}`)
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            [CUSTOMER_ACCESS_COOKIE]: second.access_token,
            [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
          }),
        )
        .set('x-csrf-token', CSRF_TOKEN)
        .expect(200);

      expect(await refreshTokenExists(first.refreshToken)).toBe(false);
      expect(await refreshTokenExists(second.refresh_token)).toBe(true);
    });

    it('revokes all sessions including the current one', async () => {
      const session = await createCustomerSession();

      await request(app.getHttpServer())
        .delete('/v1/auth/sessions')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            [CUSTOMER_ACCESS_COOKIE]: session.accessToken,
            [CUSTOMER_CSRF_COOKIE]: CSRF_TOKEN,
          }),
        )
        .set('x-csrf-token', CSRF_TOKEN)
        .expect(200);

      expect(await refreshTokenExists(session.refreshToken)).toBe(false);

      await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Origin', CUSTOMER_ORIGIN)
        .set(
          'Cookie',
          buildCookieHeader({
            [CUSTOMER_ACCESS_COOKIE]: session.accessToken,
          }),
        )
        .expect(401);
    });

    it('concurrent refresh allows only one winner', async () => {
      const session = await createCustomerSession();
      const [a, b] = await Promise.allSettled([
        authService.refresh(session.refreshToken, AuthSurface.CUSTOMER),
        authService.refresh(session.refreshToken, AuthSurface.CUSTOMER),
      ]);

      const fulfilled = [a, b].filter((r) => r.status === 'fulfilled');
      const rejected = [a, b].filter((r) => r.status === 'rejected');
      expect(fulfilled.length).toBe(1);
      expect(rejected.length).toBe(1);
      expect(await refreshTokenExists(session.refreshToken)).toBe(false);
      const winner = (
        fulfilled[0] as PromiseFulfilledResult<{
          refresh_token: string;
        }>
      ).value;
      expect(await refreshTokenExists(winner.refresh_token)).toBe(true);
    });
  });
});
