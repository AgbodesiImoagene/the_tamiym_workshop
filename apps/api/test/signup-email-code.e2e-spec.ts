import { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import Redis from 'ioredis';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { AuthService } from '../src/auth/auth.service';
import { AuthRateLimitService } from '../src/auth/auth-rate-limit.service';
import { AUTH_RATE_LIMIT_KEY_PREFIX } from '../src/auth/auth-rate-limit';
import {
  CUSTOMER_ACCESS_COOKIE_NAME,
  CUSTOMER_CSRF_COOKIE_NAME,
  JOB_PASSWORD_RESET_EMAIL,
  MAIL_QUEUE_NAME,
} from '../src/constants';
import { UserRole, UserStatus } from '../src/generated/prisma/client';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

/**
 * TTW-254: a new sign-up in apps/app is confirmed with a one-time code sent by
 * email. No user, session or cookie exists until the right code is entered.
 *
 * Routes under test (all public, CUSTOMER surface):
 *   POST /v1/auth/register/start   { email, password, firstName, lastName }
 *   POST /v1/auth/register/verify  { signupToken, code }
 *   POST /v1/auth/register/resend  { signupToken }
 *
 * The pending sign-up lives in the "pending_signups" table; it is read here with raw SQL so this file
 * does not depend on the generated Prisma model.
 */

const JOB_SIGNUP_CODE_EMAIL = 'signup-code-email';
const PASSWORD = 'SignupPassword1!';
const OTHER_PASSWORD = 'AttackerPassword1!';
const GENERIC_MESSAGE_PATTERN = /invalid or expired/i;

interface PendingRow {
  id: string;
  email: string;
  signupTokenHash: string;
  codeHash: string | null;
  passwordHash: string;
  attempts: number;
  sendCount: number;
  windowStartedAt: Date;
  lastSentAt: Date;
  expiresAt: Date;
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function setCookies(res: Response): string[] {
  const raw = res.headers['set-cookie'] as string[] | string | undefined;
  return Array.isArray(raw) ? raw : raw ? [raw] : [];
}

describe('Sign-up confirmed by an emailed code (TTW-254)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let redis: Redis;
  let mailAdd: jest.SpyInstance;
  const runId = `ttw254-${Date.now()}`;
  let counter = 0;

  beforeAll(async () => {
    app = await createE2eApp();
    // Listen once: twenty parallel requests each opening their own throwaway server reset connections.
    await app.listen(0);
    prisma = app.get(PrismaService);
    const mailQueue = app.get<Queue>(getQueueToken(MAIL_QUEUE_NAME), {
      strict: false,
    });
    mailAdd = jest.spyOn(mailQueue, 'add');
    redis = new Redis({
      host: process.env.REDIS_HOST || '127.0.0.1',
      port: Number(process.env.REDIS_PORT || 6379),
      password: process.env.REDIS_PASSWORD || undefined,
      db: Number(process.env.REDIS_DB || 0),
      maxRetriesPerRequest: 1,
    });
  });

  /** Forget the counters of the sign-up buckets (the limit tests fill them on purpose). */
  async function resetSignupBuckets(): Promise<void> {
    const keys = await redis.keys(`${AUTH_RATE_LIMIT_KEY_PREFIX}:*:signup_*`);
    if (keys.length > 0) await redis.del(...keys);
  }

  beforeEach(resetSignupBuckets);

  afterAll(async () => {
    await prisma.$executeRaw`DELETE FROM "pending_signups" WHERE "email" LIKE ${`${runId}-%`}`;
    await prisma.user.deleteMany({
      where: { email: { startsWith: `${runId}-` } },
    });
    redis.disconnect();
    await closeE2eApp(app);
  });

  function newEmail(label = 'user'): string {
    counter += 1;
    return `${runId}-${label}-${counter}@example.com`;
  }

  function start(
    email: string,
    overrides: Record<string, unknown> = {},
  ): request.Test {
    return request(app.getHttpServer())
      .post('/v1/auth/register/start')
      .send({
        email,
        password: PASSWORD,
        firstName: 'Ada',
        lastName: 'Lovelace',
        ...overrides,
      });
  }

  function verify(signupToken: string, code: string): request.Test {
    return request(app.getHttpServer())
      .post('/v1/auth/register/verify')
      .send({ signupToken, code });
  }

  function resend(signupToken: string): request.Test {
    return request(app.getHttpServer())
      .post('/v1/auth/register/resend')
      .send({ signupToken });
  }

  function login(email: string, password: string): request.Test {
    return request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password });
  }

  /** The code of the last sign-up mail queued for `email`. */
  function emailedCode(email: string): string {
    const calls = mailAdd.mock.calls as Array<
      [string, { to: string; code?: string }]
    >;
    const call = [...calls]
      .reverse()
      .find(
        ([name, data]) => name === JOB_SIGNUP_CODE_EMAIL && data.to === email,
      );
    if (!call?.[1].code) throw new Error(`no sign-up code queued for ${email}`);
    return call[1].code;
  }

  function signupMailCount(email: string): number {
    const calls = mailAdd.mock.calls as Array<[string, { to: string }]>;
    return calls.filter(
      ([name, data]) => name === JOB_SIGNUP_CODE_EMAIL && data.to === email,
    ).length;
  }

  async function pendingRow(email: string): Promise<PendingRow | undefined> {
    const rows = await prisma.$queryRaw<PendingRow[]>`
      SELECT * FROM "pending_signups" WHERE "email" = ${email.toLowerCase().trim()}`;
    return rows[0];
  }

  async function userByEmail(email: string) {
    return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  /** Start a sign-up and return its token and emailed code. */
  async function startedSignup(
    overrides: Record<string, unknown> = {},
    label = 'user',
  ) {
    const email = newEmail(label);
    const res = await start(email, overrides).expect(202);
    return {
      email,
      signupToken: (res.body as { signupToken: string }).signupToken,
      code: emailedCode(email),
    };
  }

  function wrongCode(code: string): string {
    return code === '000000' ? '000001' : '000000';
  }

  describe('start', () => {
    it('creates no user, session or cookie; stores a pending sign-up and queues a 6-digit code', async () => {
      const email = newEmail();
      const res = await start(email).expect(202);

      expect(setCookies(res)).toEqual([]);
      expect(res.body).toEqual({
        message: expect.any(String),
        signupToken: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(await userByEmail(email)).toBeNull();

      const row = await pendingRow(email);
      expect(row).toBeDefined();
      expect(row?.attempts).toBe(0);
      expect(row?.sendCount).toBe(1);

      const calls = mailAdd.mock.calls as Array<
        [string, { to: string; code: string; expiresAt: string | number }]
      >;
      const job = calls.find(
        ([name, data]) => name === JOB_SIGNUP_CODE_EMAIL && data.to === email,
      );
      expect(job?.[1].code).toMatch(/^\d{6}$/);
      expect(job?.[1].expiresAt).toBeDefined();
    });

    it('never stores the raw code or the raw token, and keeps the code valid for about 10 minutes', async () => {
      const { email, signupToken, code } = await startedSignup();
      const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT * FROM "pending_signups" WHERE "email" = ${email}`;
      const values = rows.flatMap((row) => Object.values(row));

      expect(values).not.toContain(code);
      expect(values).not.toContain(signupToken);
      expect(values).toContain(sha256(signupToken));

      const row = await pendingRow(email);
      const ttlMs = (row?.expiresAt.getTime() ?? 0) - Date.now();
      expect(ttlMs).toBeGreaterThan(9 * 60_000);
      expect(ttlMs).toBeLessThanOrEqual(10 * 60_000 + 5_000);
    });

    it('lower-cases and trims the email once, everywhere', async () => {
      const email = newEmail('Mixed');
      await start(`  ${email.toUpperCase()}  `).expect(202);

      expect(await pendingRow(email)).toBeDefined();
      expect(signupMailCount(email.toLowerCase())).toBe(1);
    });

    it('rejects a weak password, a missing name, an invalid email and an over-long email', async () => {
      await start(newEmail(), { password: 'weak' }).expect(400);
      await start(newEmail(), { firstName: '' }).expect(400);
      await start('not-an-email').expect(400);
      await start(`${'a'.repeat(250)}@example.com`).expect(400);
    });

    it('answers a verified account exactly like a new address, and stores and sends nothing', async () => {
      const taken = newEmail('taken');
      await prisma.user.create({
        data: {
          email: taken,
          passwordHash: await bcrypt.hash(PASSWORD, 4),
          firstName: 'Taken',
          lastName: 'Account',
          role: UserRole.CUSTOMER,
          status: UserStatus.ACTIVE,
          emailVerifiedAt: new Date(),
        },
      });

      const fresh = await start(newEmail()).expect(202);
      const existing = await start(taken).expect(202);

      expect(existing.status).toBe(fresh.status);
      expect(Object.keys(existing.body as object).sort()).toEqual(
        Object.keys(fresh.body as object).sort(),
      );
      expect((existing.body as { message: string }).message).toBe(
        (fresh.body as { message: string }).message,
      );
      expect((existing.body as { signupToken: string }).signupToken).toMatch(
        /^[0-9a-f]{64}$/,
      );
      expect(await pendingRow(taken)).toBeUndefined();
      expect(signupMailCount(taken)).toBe(0);
    });

    it('lets the real owner take over an unverified account left by the old register route', async () => {
      const email = newEmail('squat');
      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send({
          email,
          password: OTHER_PASSWORD,
          firstName: 'Squatter',
          lastName: 'Account',
        })
        .expect(201);

      const res = await start(email).expect(202);
      const code = emailedCode(email);
      const signupToken = (res.body as { signupToken: string }).signupToken;

      const confirmed = await verify(signupToken, code).expect(201);
      expect(setCookies(confirmed).length).toBeGreaterThan(0);

      // The squatter's password no longer works; the owner's does.
      await login(email, OTHER_PASSWORD).expect(401);
      await login(email, PASSWORD).expect(200);
      const user = await userByEmail(email);
      expect(user?.emailVerifiedAt).not.toBeNull();
    });

    it('a restart overwrites the credentials and the token; the mailed code is not re-sent inside the cooldown', async () => {
      const email = newEmail();
      const first = await start(email).expect(202);
      const code = emailedCode(email);

      const second = await start(email, {
        password: OTHER_PASSWORD,
        firstName: 'Second',
      }).expect(202);
      const firstToken = (first.body as { signupToken: string }).signupToken;
      const secondToken = (second.body as { signupToken: string }).signupToken;

      expect(secondToken).not.toBe(firstToken);
      expect(signupMailCount(email)).toBe(1);

      await verify(firstToken, code).expect(400);
      await verify(secondToken, code).expect(201);
      await login(email, OTHER_PASSWORD).expect(200);
      await login(email, PASSWORD).expect(401);
    });
  });

  describe('verify', () => {
    it('creates the verified user, signs them in with customer cookies and a csrf token, and consumes the sign-up', async () => {
      const { email, signupToken, code } = await startedSignup();
      const res = await verify(signupToken, code).expect(201);

      const cookies = setCookies(res).join(';');
      expect(cookies).toContain(CUSTOMER_ACCESS_COOKIE_NAME);
      expect(cookies).toContain(CUSTOMER_CSRF_COOKIE_NAME);
      // The admin surface may be cleared (empty value), never given a session.
      expect(cookies).not.toMatch(/ttw_admin_[a-z]+=[^;\s]/);
      expect(res.body).toEqual(
        expect.objectContaining({
          csrf_token: expect.any(String),
          user: expect.objectContaining({ email }),
        }),
      );

      const user = await userByEmail(email);
      expect(user?.emailVerifiedAt).not.toBeNull();
      expect(user?.role).toBe(UserRole.CUSTOMER);
      expect(await pendingRow(email)).toBeUndefined();
      await login(email, PASSWORD).expect(200);
    });

    it('refuses a wrong code with a generic error, no user and no cookie, and counts the attempt', async () => {
      const { email, signupToken, code } = await startedSignup();
      const res = await verify(signupToken, wrongCode(code)).expect(400);

      expect(setCookies(res)).toEqual([]);
      expect((res.body as { message: string }).message).toMatch(
        GENERIC_MESSAGE_PATTERN,
      );
      expect(await userByEmail(email)).toBeNull();
      expect((await pendingRow(email))?.attempts).toBe(1);
    });

    it('gives the same answer for a wrong code, an unknown token, an expired code and a replay', async () => {
      const wrong = await startedSignup();
      const wrongRes = await verify(
        wrong.signupToken,
        wrongCode(wrong.code),
      ).expect(400);

      const unknownRes = await verify('f'.repeat(64), '123456').expect(400);

      const expired = await startedSignup();
      await prisma.$executeRaw`
        UPDATE "pending_signups" SET "expiresAt" = (now() AT TIME ZONE 'UTC') - interval '1 minute'
        WHERE "email" = ${expired.email}`;
      const expiredRes = await verify(expired.signupToken, expired.code).expect(
        400,
      );

      const used = await startedSignup();
      await verify(used.signupToken, used.code).expect(201);
      const replayRes = await verify(used.signupToken, used.code).expect(400);

      for (const res of [unknownRes, expiredRes, replayRes]) {
        expect(res.body).toEqual(wrongRes.body);
      }
      expect(await userByEmail(expired.email)).toBeNull();
    });

    it('locks after five wrong attempts, keeps the row, and refuses even the right code', async () => {
      const { email, signupToken, code } = await startedSignup();
      for (let i = 0; i < 5; i += 1) {
        await verify(signupToken, wrongCode(code)).expect(400);
      }

      await verify(signupToken, code).expect(400);
      expect(await userByEmail(email)).toBeNull();

      const row = await pendingRow(email);
      expect(row).toBeDefined();
      expect(row?.attempts).toBe(5);
    });

    it('lets at most five guesses through when twenty arrive at once', async () => {
      const { email, signupToken, code } = await startedSignup();
      const results = await Promise.all(
        Array.from({ length: 20 }, () => verify(signupToken, wrongCode(code))),
      );

      // Some of the twenty may be rate limited (429); none may succeed.
      expect(results.every((r) => [400, 429].includes(r.status))).toBe(true);
      expect((await pendingRow(email))?.attempts).toBeLessThanOrEqual(5);
      // The burst also filled the rate-limit window; clear it to check the lock itself.
      await resetSignupBuckets();
      await verify(signupToken, code).expect(400);
    });

    it('creates one account and one session when several correct confirmations arrive at once', async () => {
      const { email, signupToken, code } = await startedSignup();
      const results = await Promise.all(
        Array.from({ length: 5 }, () => verify(signupToken, code)),
      );

      expect(results.filter((r) => r.status === 201)).toHaveLength(1);
      expect(
        results.filter((r) => r.status !== 201).every((r) => r.status === 400),
      ).toBe(true);
      expect(await prisma.user.count({ where: { email } })).toBe(1);
      const user = await userByEmail(email);
      const sessions = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT count(*)::bigint AS count FROM "auth_sessions" WHERE "userId" = ${user?.id}`;
      expect(Number(sessions[0].count)).toBe(1);
    });

    it('does not let a third party who started first confirm with the victim code (pre-hijack, attacker first)', async () => {
      const email = newEmail('victim');
      const attacker = await start(email, { password: OTHER_PASSWORD }).expect(
        202,
      );
      const attackerToken = (attacker.body as { signupToken: string })
        .signupToken;
      const victim = await start(email).expect(202);
      const victimToken = (victim.body as { signupToken: string }).signupToken;
      const code = emailedCode(email);

      await verify(attackerToken, code).expect(400);
      await verify(victimToken, code).expect(201);
      await login(email, OTHER_PASSWORD).expect(401);
      await login(email, PASSWORD).expect(200);
    });

    it('does not let a third party who started last obtain an account with the first password (victim first)', async () => {
      const email = newEmail('victim');
      const victim = await start(email).expect(202);
      const victimToken = (victim.body as { signupToken: string }).signupToken;
      const attacker = await start(email, { password: OTHER_PASSWORD }).expect(
        202,
      );
      const attackerToken = (attacker.body as { signupToken: string })
        .signupToken;
      const code = emailedCode(email);

      // The code only reaches the victim's mailbox: the victim's token is dead, the attacker cannot read the code.
      await verify(victimToken, code).expect(400);
      // The attacker's token with a guessed code does not create anything either.
      await verify(attackerToken, wrongCode(code)).expect(400);
      expect(await userByEmail(email)).toBeNull();

      // The victim starts again: their credentials and token now own the row, and the code they
      // already hold (the cooldown kept it) confirms. The account has the victim's password,
      // never the attacker's: a restart is a bounded nuisance, not a takeover.
      const again = await start(email).expect(202);
      const againToken = (again.body as { signupToken: string }).signupToken;
      await verify(attackerToken, code).expect(400);
      await verify(againToken, code).expect(201);
      await login(email, PASSWORD).expect(200);
      await login(email, OTHER_PASSWORD).expect(401);
    });
  });

  describe('resend', () => {
    it('sends nothing inside the 60 second cooldown, and the answer is the same as for a token that matches no sign-up', async () => {
      const { email, signupToken } = await startedSignup();
      const inCooldown = await resend(signupToken).expect(202);
      const decoy = await resend('e'.repeat(64)).expect(202);

      expect(signupMailCount(email)).toBe(1);
      // Nothing in the answer may tell a real sign-up from an unknown token, or an address
      // that has an account from one that does not.
      expect(inCooldown.status).toBe(decoy.status);
      expect(inCooldown.body).toEqual(decoy.body);
    });

    it('sends a new code after the cooldown; the old code dies and the attempts reset', async () => {
      const { email, signupToken, code: oldCode } = await startedSignup();
      await verify(signupToken, wrongCode(oldCode)).expect(400);
      await prisma.$executeRaw`
        UPDATE "pending_signups" SET "lastSentAt" = (now() AT TIME ZONE 'UTC') - interval '61 seconds'
        WHERE "email" = ${email}`;

      await resend(signupToken).expect(202);
      const newCode = emailedCode(email);

      expect(signupMailCount(email)).toBe(2);
      expect((await pendingRow(email))?.attempts).toBe(0);
      if (newCode !== oldCode) await verify(signupToken, oldCode).expect(400);
      await verify(signupToken, newCode).expect(201);
    });

    it('stops at five sends an hour, and wrong guesses, locking and restarting do not reset that', async () => {
      const { email, signupToken, code } = await startedSignup();
      await prisma.$executeRaw`
        UPDATE "pending_signups"
        SET "sendCount" = 5, "lastSentAt" = (now() AT TIME ZONE 'UTC') - interval '2 minutes'
        WHERE "email" = ${email}`;

      // Held back by the cap, with the same answer as a real send.
      await resend(signupToken).expect(202);
      expect(signupMailCount(email)).toBe(1);

      for (let i = 0; i < 5; i += 1) {
        await verify(signupToken, wrongCode(code)).expect(400);
      }
      await prisma.$executeRaw`
        UPDATE "pending_signups" SET "lastSentAt" = (now() AT TIME ZONE 'UTC') - interval '2 minutes'
        WHERE "email" = ${email}`;
      await start(email).expect(202);

      const row = await pendingRow(email);
      expect(row?.sendCount).toBeGreaterThanOrEqual(5);
      expect(signupMailCount(email)).toBe(1);
    });

    it('answers an unknown token with the generic success and sends nothing', async () => {
      const before = mailAdd.mock.calls.length;
      await resend('e'.repeat(64)).expect(202);
      expect(mailAdd.mock.calls.length).toBe(before);
    });
  });

  describe('rate limits', () => {
    it('limits sends per address: the fourth start inside the window is refused', async () => {
      const email = newEmail();
      await start(email).expect(202);
      await start(email).expect(202);
      await start(email).expect(202);
      await start(email).expect(429);
    });

    it('limits sends per IP: the eleventh start from one address is refused', async () => {
      for (let i = 0; i < 10; i += 1) {
        await start(newEmail()).expect(202);
      }
      await start(newEmail()).expect(429);
    });

    it('counts confirmations per sign-up token, not per email: requests that name the victim cannot burn the victim window', async () => {
      const victim = await startedSignup();
      // Twelve distinct tokens (more than the per-token limit of 10) each naming the victim's
      // address. If the bucket were keyed by email the victim would now be limited.
      for (let i = 0; i < 12; i += 1) {
        const res = await request(app.getHttpServer())
          .post('/v1/auth/register/verify')
          .send({
            signupToken: `${i.toString(16).padStart(2, '0')}${'d'.repeat(62)}`,
            code: '123456',
            email: victim.email,
          });
        // 400 (unknown field refused by validation); never 429 for this address.
        expect(res.status).toBe(400);
      }
      await verify(victim.signupToken, victim.code).expect(201);
    });

    it('limits confirmations from one IP: the first thirty are answered, the thirty-first is refused', async () => {
      const statuses: number[] = [];
      for (let i = 0; i < 31; i += 1) {
        const res = await verify(
          `${i.toString(16).padStart(2, '0')}${'c'.repeat(62)}`,
          '123456',
        );
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 30).every((status) => status === 400)).toBe(
        true,
      );
      expect(statuses[30]).toBe(429);
    });

    it('limits confirmations per sign-up token: the eleventh call with one token is refused', async () => {
      const { signupToken, code } = await startedSignup();
      const statuses: number[] = [];
      for (let i = 0; i < 11; i += 1) {
        statuses.push((await verify(signupToken, wrongCode(code))).status);
      }
      expect(statuses[10]).toBe(429);
    });
  });

  describe('when the rate limiter cannot reach Redis', () => {
    let restore: () => void;

    beforeEach(() => {
      // The limiter's Redis client is private; reach it to make it fail.
      const limiter: {
        redis: { eval: (...args: unknown[]) => Promise<unknown> };
      } = app.get<unknown>(AuthRateLimitService) as never;
      const spy = jest
        .spyOn(limiter.redis, 'eval')
        .mockRejectedValue(new Error('redis is down'));
      restore = () => spy.mockRestore();
    });

    afterEach(() => restore());

    it('answers 503 on start and writes nothing', async () => {
      const email = newEmail();
      const before = mailAdd.mock.calls.length;

      await start(email).expect(503);

      expect(await pendingRow(email)).toBeUndefined();
      expect(mailAdd.mock.calls.length).toBe(before);
    });

    it('answers 503 on verify and resend, and creates and sends nothing', async () => {
      const before = mailAdd.mock.calls.length;

      await verify('a'.repeat(64), '123456').expect(503);
      await resend('a'.repeat(64)).expect(503);

      expect(mailAdd.mock.calls.length).toBe(before);
    });
  });

  describe('races', () => {
    it('confirmation against Google sign-in for the same address: one account, a consistent password', async () => {
      const { email, signupToken, code } = await startedSignup();
      const authService = app.get(AuthService);

      const [confirmed] = await Promise.all([
        verify(signupToken, code),
        authService.loginWithGoogleProfile({
          providerAccountId: `g-${email}`,
          email,
          emailVerified: true,
          firstName: 'Google',
          lastName: 'Person',
        }),
      ]);

      expect(await prisma.user.count({ where: { email } })).toBe(1);
      expect(await pendingRow(email)).toBeUndefined();
      expect([201, 400]).toContain(confirmed.status);
      // If the code won, the password works; if Google won, the account has no password.
      await login(email, PASSWORD).expect(confirmed.status === 201 ? 200 : 401);
    });

    it('confirmation against the old register route for the same address: one account, the owner password wins', async () => {
      const { email, signupToken, code } = await startedSignup();

      const [confirmed, old] = await Promise.all([
        verify(signupToken, code),
        request(app.getHttpServer()).post('/v1/auth/register').send({
          email,
          password: OTHER_PASSWORD,
          firstName: 'Squatter',
          lastName: 'Account',
        }),
      ]);

      expect(await prisma.user.count({ where: { email } })).toBe(1);
      expect(confirmed.status).toBe(201);
      expect([201, 409]).toContain(old.status);
      // Whichever came first, the person who proved the mailbox ends up with the account.
      await login(email, PASSWORD).expect(200);
      await login(email, OTHER_PASSWORD).expect(401);
    });

    it('resend against confirmation: no server error, at most one account, and the row is gone once confirmed', async () => {
      const { email, signupToken, code } = await startedSignup();
      await prisma.$executeRaw`
        UPDATE "pending_signups" SET "lastSentAt" = (now() AT TIME ZONE 'UTC') - interval '2 minutes'
        WHERE "email" = ${email}`;

      const [again, confirmed] = await Promise.all([
        resend(signupToken),
        verify(signupToken, code),
      ]);

      expect(again.status).toBe(202);
      expect([201, 400]).toContain(confirmed.status);
      expect(await prisma.user.count({ where: { email } })).toBe(
        confirmed.status === 201 ? 1 : 0,
      );
      if (confirmed.status === 201) {
        expect(await pendingRow(email)).toBeUndefined();
      }
    });
  });

  describe('interactions', () => {
    it('does not send a reset email for an address that only has a pending sign-up, and leaves the row alone', async () => {
      const { email } = await startedSignup();
      const before = await pendingRow(email);

      await request(app.getHttpServer())
        .post('/v1/auth/forgot-password')
        .send({ email })
        .expect(200);

      const resets = (
        mailAdd.mock.calls as Array<[string, { to: string }]>
      ).filter(
        ([name, data]) =>
          name === JOB_PASSWORD_RESET_EMAIL && data.to === email,
      );
      expect(resets).toHaveLength(0);
      expect(await pendingRow(email)).toEqual(before);
    });

    it('is not refused by csrf when the browser still holds a stale customer cookie', async () => {
      const email = newEmail();
      await request(app.getHttpServer())
        .post('/v1/auth/register/start')
        .set('Cookie', `${CUSTOMER_ACCESS_COOKIE_NAME}=stale-token`)
        .send({
          email,
          password: PASSWORD,
          firstName: 'Ada',
          lastName: 'Lovelace',
        })
        .expect(202);
    });

    it('never puts the code or the token in the audit rows', async () => {
      const { signupToken, code } = await startedSignup();
      await verify(signupToken, code).expect(201);

      const rows = await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*)::bigint AS n FROM "audit_logs"
        WHERE "after"::text LIKE ${`%${code}%`} OR "after"::text LIKE ${`%${signupToken}%`}`;
      expect(Number(rows[0].n)).toBe(0);
    });
  });
});
