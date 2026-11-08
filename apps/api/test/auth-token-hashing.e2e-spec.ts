import { INestApplication } from '@nestjs/common';
import { getQueueToken } from '@nestjs/bullmq';
import type { Queue } from 'bullmq';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { createHash } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  JOB_PASSWORD_RESET_EMAIL,
  JOB_VERIFICATION_EMAIL,
  MAIL_QUEUE_NAME,
} from '../src/constants';
import { UserRole, UserStatus } from '../src/generated/prisma/client';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

const OLD_PASSWORD = 'OldPassword123!';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

/**
 * TTW-083: password-reset and email-verification tokens are stored as a
 * SHA-256 digest only. The raw token exists only in the emailed link, so a
 * database read alone cannot produce a working link.
 */
describe('Reset and verification tokens are stored hashed (TTW-083)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let mailAdd: jest.SpyInstance;
  const createdUserIds: string[] = [];
  let counter = 0;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    const mailQueue = app.get<Queue>(getQueueToken(MAIL_QUEUE_NAME), {
      strict: false,
    });
    mailAdd = jest.spyOn(mailQueue, 'add');
  });

  afterAll(async () => {
    if (prisma && createdUserIds.length > 0) {
      await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    }
    await closeE2eApp(app);
  });

  async function createUser(verified: boolean) {
    counter += 1;
    const user = await prisma.user.create({
      data: {
        email: `ttw083-${Date.now()}-${counter}@example.com`,
        passwordHash: await bcrypt.hash(OLD_PASSWORD, 4),
        firstName: 'Token',
        lastName: 'Hashing',
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: verified ? new Date() : null,
      },
    });
    createdUserIds.push(user.id);
    return user;
  }

  /** Raw token from the last link queued for `email`. */
  function emailedToken(jobName: string, email: string): string {
    const calls = mailAdd.mock.calls as Array<
      [string, { to: string; resetUrl?: string; verifyUrl?: string }]
    >;
    const call = [...calls]
      .reverse()
      .find(([name, data]) => name === jobName && data.to === email);
    if (!call) throw new Error(`no ${jobName} queued for ${email}`);
    const link = call[1].resetUrl ?? call[1].verifyUrl;
    const token = new URL(link as string).searchParams.get('token');
    if (!token) throw new Error('no token in emailed link');
    return token;
  }

  /** Every column of the user's stored tokens, read straight from Postgres. */
  async function storedValues(userId: string): Promise<unknown[]> {
    const rows = await prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT * FROM "auth_tokens" WHERE "userId" = ${userId}`;
    return rows.flatMap((row) => Object.values(row));
  }

  async function requestReset(email: string): Promise<string> {
    await request(app.getHttpServer())
      .post('/v1/auth/forgot-password')
      .send({ email })
      .expect(200);
    return emailedToken(JOB_PASSWORD_RESET_EMAIL, email);
  }

  function reset(token: string, newPassword: string) {
    return request(app.getHttpServer())
      .post('/v1/auth/reset-password')
      .send({ token, newPassword });
  }

  function login(email: string, password: string) {
    return request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email, password });
  }

  describe('password reset', () => {
    it('stores a digest, never the emailed token, and the emailed token resets the password once', async () => {
      const user = await createUser(true);
      const raw = await requestReset(user.email);

      const values = await storedValues(user.id);
      expect(values).not.toContain(raw);
      expect(values).toContain(sha256(raw));

      await reset(raw, 'NewPassword123!').expect(200);
      await login(user.email, 'NewPassword123!').expect(200);
      await expect(storedValues(user.id)).resolves.toEqual([]);

      // Single use: replaying the same link fails.
      await reset(raw, 'OtherPassword123!').expect(400);
      await login(user.email, 'NewPassword123!').expect(200);
    });

    it('rejects the stored digest when it is sent as the token', async () => {
      const user = await createUser(true);
      const raw = await requestReset(user.email);
      const digest = sha256(raw);
      expect(await storedValues(user.id)).toContain(digest);

      await reset(digest, 'Hijacked123!').expect(400);
      await login(user.email, OLD_PASSWORD).expect(200);
    });

    it('lets only one of two simultaneous resets with the same link succeed', async () => {
      const user = await createUser(true);
      const raw = await requestReset(user.email);

      const results = await Promise.all([
        reset(raw, 'FirstPassword123!'),
        reset(raw, 'SecondPassword123!'),
      ]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
      const winner =
        results[0].status === 200 ? 'FirstPassword123!' : 'SecondPassword123!';
      await login(user.email, winner).expect(200);
    });

    it('rejects an expired reset token and removes it', async () => {
      const user = await createUser(true);
      const raw = await requestReset(user.email);
      await prisma.$executeRaw`
        UPDATE "auth_tokens" SET "expiresAt" = NOW() - INTERVAL '1 minute'
        WHERE "userId" = ${user.id}`;

      await reset(raw, 'NewPassword123!').expect(400);
      await login(user.email, OLD_PASSWORD).expect(200);
      await expect(storedValues(user.id)).resolves.toEqual([]);
    });
  });

  describe('email verification', () => {
    async function requestVerification(email: string): Promise<string> {
      await request(app.getHttpServer())
        .post('/v1/auth/resend-verification')
        .send({ email })
        .expect(200);
      return emailedToken(JOB_VERIFICATION_EMAIL, email);
    }

    function verify(token: string) {
      return request(app.getHttpServer())
        .post('/v1/auth/verify-email')
        .send({ token });
    }

    it('stores a digest, never the emailed token, and the emailed token verifies once', async () => {
      const user = await createUser(false);
      const raw = await requestVerification(user.email);

      const values = await storedValues(user.id);
      expect(values).not.toContain(raw);
      expect(values).toContain(sha256(raw));

      await verify(raw).expect(200);
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.emailVerifiedAt).toBeInstanceOf(Date);

      await verify(raw).expect(400);
    });

    it('rejects the stored digest when it is sent as the token', async () => {
      const user = await createUser(false);
      const raw = await requestVerification(user.email);

      await verify(sha256(raw)).expect(400);
      const after = await prisma.user.findUniqueOrThrow({
        where: { id: user.id },
      });
      expect(after.emailVerifiedAt).toBeNull();
    });

    it('lets only one of two simultaneous verifications with the same link succeed', async () => {
      const user = await createUser(false);
      const raw = await requestVerification(user.email);

      const results = await Promise.all([verify(raw), verify(raw)]);

      expect(results.map((r) => r.status).sort()).toEqual([200, 400]);
    });
  });
});
