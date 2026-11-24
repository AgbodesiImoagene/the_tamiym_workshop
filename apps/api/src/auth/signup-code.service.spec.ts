import { Logger } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client';
import { UserRole, UserStatus } from '../generated/prisma/client';
import { AUTH_LINK_JOB_OPTIONS, JOB_SIGNUP_CODE_EMAIL } from '../constants';
import { hashSignupCode, resolveSignupCodeKey } from './signup-code.crypto';
import {
  INVALID_SIGNUP_CODE_CODE,
  SIGNUP_CODE_SENT_MESSAGE,
  SignupCodeService,
} from './signup-code.service';

// The password hashing cost is not what these unit tests are about, and a real bcrypt hash made
// them time out on a loaded machine. The real hash is exercised by the e2e suite.
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('bcrypt-hash'),
}));

const KEY_TEXT = 'a-unit-test-hmac-key-that-is-long-enough';
const KEY = resolveSignupCodeKey({ SIGNUP_CODE_HMAC_KEY: KEY_TEXT });
const EMAIL = 'new.user@example.com';
const TOKEN = 'a'.repeat(64);

const startDto = {
  email: EMAIL,
  password: 'SignupPassword1!',
  firstName: 'Ada',
  lastName: 'Lovelace',
};

describe('SignupCodeService (TTW-254)', () => {
  let service: SignupCodeService;
  let prisma: {
    $queryRaw: jest.Mock;
    $executeRaw: jest.Mock;
    $transaction: jest.Mock;
    user: { findUnique: jest.Mock };
    pendingSignup: { findUnique: jest.Mock };
  };
  let tx: {
    pendingSignup: { deleteMany: jest.Mock };
    user: { findUnique: jest.Mock; update: jest.Mock; create: jest.Mock };
    authToken: { deleteMany: jest.Mock };
  };
  let audit: { log: jest.Mock };
  let observability: { recordAuthLogin: jest.Mock };
  let jwt: { sign: jest.Mock };
  let authSession: { createSession: jest.Mock; revokeAllForUser: jest.Mock };
  let mailQueue: { add: jest.Mock };
  let warn: jest.SpyInstance;

  const account = {
    id: 'user-1',
    email: EMAIL,
    firstName: 'Ada',
    lastName: 'Lovelace',
    phone: null,
    role: UserRole.CUSTOMER,
    status: UserStatus.ACTIVE,
  };

  beforeEach(() => {
    tx = {
      pendingSignup: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      user: {
        findUnique: jest.fn().mockResolvedValue(null),
        update: jest.fn().mockResolvedValue(account),
        create: jest.fn().mockResolvedValue(account),
      },
      authToken: { deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    };
    prisma = {
      $queryRaw: jest.fn(),
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn((callback: (t: typeof tx) => unknown) =>
        Promise.resolve(callback(tx)),
      ),
      user: { findUnique: jest.fn().mockResolvedValue(null) },
      pendingSignup: { findUnique: jest.fn() },
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    observability = { recordAuthLogin: jest.fn() };
    jwt = { sign: jest.fn().mockReturnValue('signed-access-token') };
    authSession = {
      createSession: jest.fn().mockResolvedValue({
        session: { id: 'session-1' },
        refreshToken: 'refresh-plain',
      }),
      revokeAllForUser: jest.fn().mockResolvedValue(2),
    };
    mailQueue = { add: jest.fn().mockResolvedValue(undefined) };
    warn = jest
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);

    service = new SignupCodeService(
      prisma as never,
      audit as never,
      observability as never,
      jwt as never,
      {
        get: (name: string) =>
          name === 'SIGNUP_CODE_HMAC_KEY' ? KEY_TEXT : undefined,
      } as never,
      authSession as never,
      mailQueue as never,
    );
  });

  afterEach(() => warn.mockRestore());

  describe('start', () => {
    it('queues a six-digit code for a new address and never returns it', async () => {
      const expiresAt = new Date(Date.now() + 600_000);
      prisma.$queryRaw.mockResolvedValue([{ sent: true, expiresAt }]);

      const result = await service.start(startDto);

      expect(result).toEqual({
        message: SIGNUP_CODE_SENT_MESSAGE,
        signupToken: expect.stringMatching(/^[0-9a-f]{64}$/),
      });
      expect(mailQueue.add).toHaveBeenCalledWith(
        JOB_SIGNUP_CODE_EMAIL,
        {
          to: EMAIL,
          code: expect.stringMatching(/^\d{6}$/),
          expiresAt: expiresAt.toISOString(),
        },
        AUTH_LINK_JOB_OPTIONS,
      );
      expect(JSON.stringify(result)).not.toMatch(/\b\d{6}\b/);
    });

    it('queues nothing when the cooldown or the hourly cap held the send back', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { sent: false, expiresAt: new Date() },
      ]);

      const result = await service.start(startDto);

      expect(result.signupToken).toMatch(/^[0-9a-f]{64}$/);
      expect(mailQueue.add).not.toHaveBeenCalled();
    });

    it.each([
      [
        'a verified account',
        {
          id: 'u',
          emailVerifiedAt: new Date(),
          status: UserStatus.ACTIVE,
          role: UserRole.CUSTOMER,
        },
      ],
      [
        'a suspended account',
        {
          id: 'u',
          emailVerifiedAt: null,
          status: UserStatus.SUSPENDED,
          role: UserRole.CUSTOMER,
        },
      ],
      [
        'an admin account',
        {
          id: 'u',
          emailVerifiedAt: null,
          status: UserStatus.ACTIVE,
          role: UserRole.ADMIN,
        },
      ],
    ])(
      'answers %s with a decoy token of the same shape and stores and sends nothing',
      async (_label, existing) => {
        prisma.user.findUnique.mockResolvedValue(existing);

        const result = await service.start(startDto);

        expect(result).toEqual({
          message: SIGNUP_CODE_SENT_MESSAGE,
          signupToken: expect.stringMatching(/^[0-9a-f]{64}$/),
        });
        // The same hashing work runs before the branch, so the answer's timing does not tell
        // whether the address has an account.
        expect(bcrypt.hash).toHaveBeenCalledWith(startDto.password, 10);
        expect(prisma.$queryRaw).not.toHaveBeenCalled();
        expect(mailQueue.add).not.toHaveBeenCalled();
      },
    );

    it('lets the owner of an unconfirmed account left by the old route start a sign-up', async () => {
      prisma.user.findUnique.mockResolvedValue({
        id: 'u',
        emailVerifiedAt: null,
        status: UserStatus.ACTIVE,
        role: UserRole.CUSTOMER,
      });
      prisma.$queryRaw.mockResolvedValue([
        { sent: true, expiresAt: new Date(Date.now() + 600_000) },
      ]);

      await service.start(startDto);

      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mailQueue.add).toHaveBeenCalledTimes(1);
    });

    it('gives the send back and still answers generically when the queue refuses, without logging the address or code', async () => {
      prisma.$queryRaw.mockResolvedValue([
        { sent: true, expiresAt: new Date(Date.now() + 600_000) },
      ]);
      mailQueue.add.mockRejectedValue(new Error(`boom for ${EMAIL}`));

      const result = await service.start(startDto);

      expect(result.message).toBe(SIGNUP_CODE_SENT_MESSAGE);
      expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(warn.mock.calls)).not.toContain(EMAIL);
    });
  });

  describe('resend', () => {
    it('answers an unknown token with the generic message and sends nothing', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue(null);

      await expect(service.resend(TOKEN)).resolves.toEqual({
        message: SIGNUP_CODE_SENT_MESSAGE,
      });
      expect(mailQueue.add).not.toHaveBeenCalled();
    });

    it('answers a send held back by the cooldown or the hourly cap exactly like a real send, and sends nothing', async () => {
      prisma.pendingSignup.findUnique.mockResolvedValue({ email: EMAIL });
      prisma.$queryRaw.mockResolvedValue([]);

      await expect(service.resend(TOKEN)).resolves.toEqual({
        message: SIGNUP_CODE_SENT_MESSAGE,
      });
      expect(mailQueue.add).not.toHaveBeenCalled();
    });

    it('sends a new code when the database allows it', async () => {
      const expiresAt = new Date(Date.now() + 600_000);
      prisma.pendingSignup.findUnique.mockResolvedValue({ email: EMAIL });
      prisma.$queryRaw.mockResolvedValue([{ expiresAt }]);

      await expect(service.resend(TOKEN)).resolves.toEqual({
        message: SIGNUP_CODE_SENT_MESSAGE,
      });
      expect(mailQueue.add).toHaveBeenCalledWith(
        JOB_SIGNUP_CODE_EMAIL,
        {
          to: EMAIL,
          code: expect.stringMatching(/^\d{6}$/),
          expiresAt: expiresAt.toISOString(),
        },
        AUTH_LINK_JOB_OPTIONS,
      );
    });
  });

  describe('verify', () => {
    const CODE = '123456';
    const reserved = (overrides: Record<string, unknown> = {}) => ({
      id: 'pending-1',
      email: EMAIL,
      codeHash: hashSignupCode(KEY, EMAIL, CODE),
      passwordHash: 'bcrypt-hash',
      firstName: 'Ada',
      lastName: 'Lovelace',
      phone: null,
      ...overrides,
    });

    async function expectRefused(promise: Promise<unknown>) {
      await expect(promise).rejects.toMatchObject({
        response: expect.objectContaining({ code: INVALID_SIGNUP_CODE_CODE }),
      });
    }

    it('refuses when no live row matches the token (unknown, expired, locked, reused)', async () => {
      prisma.$queryRaw.mockResolvedValue([]);

      await expectRefused(service.verify(TOKEN, CODE));
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('refuses a wrong code and creates nothing', async () => {
      prisma.$queryRaw.mockResolvedValue([reserved()]);

      await expectRefused(service.verify(TOKEN, '654321'));
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it('creates the verified account and a CUSTOMER session in one transaction', async () => {
      prisma.$queryRaw.mockResolvedValue([reserved()]);

      const result = await service.verify(TOKEN, CODE, {
        deviceLabel: 'Chrome on Mac',
      });

      expect(tx.user.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          email: EMAIL,
          passwordHash: 'bcrypt-hash',
          role: UserRole.CUSTOMER,
          emailVerifiedAt: expect.any(Date),
        }),
      });
      expect(authSession.createSession).toHaveBeenCalledWith(
        'user-1',
        'CUSTOMER',
        { deviceLabel: 'Chrome on Mac', tx },
      );
      expect(result).toEqual({
        access_token: 'signed-access-token',
        refresh_token: 'refresh-plain',
        user: expect.objectContaining({ id: 'user-1', email: EMAIL }),
      });
      expect(observability.recordAuthLogin).toHaveBeenCalledWith({
        outcome: 'success',
      });
      const audited = JSON.stringify(audit.log.mock.calls);
      expect(audited).not.toContain(CODE);
      expect(audited).not.toContain(TOKEN);
      expect(audited).toContain('auth.signup.confirmed');
    });

    it('takes over an unconfirmed account: password replaced, sessions and links revoked', async () => {
      prisma.$queryRaw.mockResolvedValue([
        reserved({ phone: '+2348012345678' }),
      ]);
      tx.user.findUnique.mockResolvedValue({
        id: 'user-1',
        emailVerifiedAt: null,
        status: UserStatus.ACTIVE,
        role: UserRole.CUSTOMER,
      });

      await service.verify(TOKEN, CODE);

      expect(tx.user.create).not.toHaveBeenCalled();
      expect(tx.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: expect.objectContaining({
          passwordHash: 'bcrypt-hash',
          phone: '+2348012345678',
          emailVerifiedAt: expect.any(Date),
        }),
      });
      expect(authSession.revokeAllForUser).toHaveBeenCalledWith('user-1', tx);
      expect(tx.authToken.deleteMany).toHaveBeenCalled();
    });

    it('refuses when another confirmation already consumed the row', async () => {
      prisma.$queryRaw.mockResolvedValue([reserved()]);
      tx.pendingSignup.deleteMany.mockResolvedValue({ count: 0 });

      await expectRefused(service.verify(TOKEN, CODE));
      expect(tx.user.create).not.toHaveBeenCalled();
    });

    it('refuses when the address already has a verified account', async () => {
      prisma.$queryRaw.mockResolvedValue([reserved()]);
      tx.user.findUnique.mockResolvedValue({
        id: 'user-9',
        emailVerifiedAt: new Date(),
        status: UserStatus.ACTIVE,
        role: UserRole.CUSTOMER,
      });

      await expectRefused(service.verify(TOKEN, CODE));
      expect(tx.user.update).not.toHaveBeenCalled();
      expect(authSession.createSession).not.toHaveBeenCalled();
    });

    it('tries again once after a unique-address collision, and then takes the account over', async () => {
      prisma.$queryRaw.mockResolvedValue([reserved()]);
      const collision = new Prisma.PrismaClientKnownRequestError(
        'Unique constraint',
        { code: 'P2002', clientVersion: 'test' },
      );
      prisma.$transaction
        .mockRejectedValueOnce(collision)
        .mockImplementationOnce((callback: (t: typeof tx) => unknown) =>
          Promise.resolve(callback(tx)),
        );

      await expect(service.verify(TOKEN, CODE)).resolves.toMatchObject({
        access_token: 'signed-access-token',
      });
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('turns a second unique-address collision into the same refusal', async () => {
      prisma.$queryRaw.mockResolvedValue([reserved()]);
      prisma.$transaction.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('Unique constraint', {
          code: 'P2002',
          clientVersion: 'test',
        }),
      );

      await expectRefused(service.verify(TOKEN, CODE));
      expect(prisma.$transaction).toHaveBeenCalledTimes(2);
    });

    it('lets other database errors through', async () => {
      prisma.$queryRaw.mockResolvedValue([reserved()]);
      prisma.$transaction.mockRejectedValue(new Error('connection lost'));

      await expect(service.verify(TOKEN, CODE)).rejects.toThrow(
        'connection lost',
      );
    });
  });
});
