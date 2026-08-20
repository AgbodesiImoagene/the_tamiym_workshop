import { UnauthorizedException } from '@nestjs/common';
import { AuthSessionService } from './auth-session.service';
import { AuthSurface } from '../generated/prisma/enums';
import * as crypto from './auth-session.crypto';

jest.mock('./auth-session.crypto', () => {
  const actual = jest.requireActual(
    './auth-session.crypto',
  ) as typeof import('./auth-session.crypto');
  return {
    ...actual,
    mintRefreshToken: jest.fn(),
    hashRefreshToken: jest.fn((t: string) => `hash:${t}`),
  };
});

type PrismaMock = {
  authSession: {
    findUnique: jest.Mock;
    findUniqueOrThrow: jest.Mock;
    findMany: jest.Mock;
    create: jest.Mock;
    update: jest.Mock;
    updateMany: jest.Mock;
  };
  $transaction: jest.Mock;
};

describe('AuthSessionService', () => {
  let service: AuthSessionService;
  let prisma: PrismaMock;

  const session = {
    id: 'sess-1',
    userId: 'user-1',
    authSurface: AuthSurface.CUSTOMER,
    refreshTokenHash: 'hash:old',
    deviceLabel: null,
    createdAt: new Date(),
    lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: null,
  };

  beforeEach(() => {
    prisma = {
      authSession: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
      },
      $transaction: jest.fn(async (fn: (tx: PrismaMock) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    service = new AuthSessionService(prisma as never);
    (crypto.mintRefreshToken as jest.Mock).mockReturnValue('new-plain');
    (crypto.hashRefreshToken as jest.Mock).mockImplementation(
      (t: string) => `hash:${t}`,
    );
  });

  it('createSession mints a hashed refresh credential and revokes other surfaces', async () => {
    prisma.authSession.updateMany.mockResolvedValue({ count: 1 });
    prisma.authSession.create.mockResolvedValue(session);

    const result = await service.createSession('user-1', AuthSurface.CUSTOMER, {
      deviceLabel: 'Mozilla',
    });

    expect(result.refreshToken).toBe('new-plain');
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          userId: 'user-1',
          revokedAt: null,
        }),
      }),
    );
    expect(prisma.authSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          refreshTokenHash: 'hash:new-plain',
          deviceLabel: 'Mozilla',
          authSurface: AuthSurface.CUSTOMER,
        }),
      }),
    );
  });

  it('rotateSession fails when concurrent update loses the optimistic lock', async () => {
    prisma.authSession.updateMany
      .mockResolvedValueOnce({ count: 0 }) // other-surface revoke
      .mockResolvedValueOnce({ count: 0 }); // rotate loses

    await expect(
      service.rotateSession(session as never, AuthSurface.CUSTOMER),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('rotateSession succeeds when updateMany count is 1', async () => {
    const next = { ...session, refreshTokenHash: 'hash:new-plain' };
    prisma.authSession.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    prisma.authSession.findUniqueOrThrow.mockResolvedValue(next);

    const result = await service.rotateSession(
      session as never,
      AuthSurface.CUSTOMER,
    );

    expect(result.refreshToken).toBe('new-plain');
    expect(result.session.refreshTokenHash).toBe('hash:new-plain');
  });

  it('requireLiveSessionByRefreshToken rejects missing/expired sessions', async () => {
    prisma.authSession.findUnique.mockResolvedValue(null);
    await expect(
      service.requireLiveSessionByRefreshToken('missing'),
    ).rejects.toThrow(UnauthorizedException);
  });

  it('assertAccessSession rejects revoked sessions', async () => {
    prisma.authSession.findUnique.mockResolvedValue({
      userId: 'user-1',
      authSurface: AuthSurface.CUSTOMER,
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
    });
    await expect(
      service.assertAccessSession('sess-1', 'user-1', AuthSurface.CUSTOMER),
    ).rejects.toThrow(UnauthorizedException);
  });
});
