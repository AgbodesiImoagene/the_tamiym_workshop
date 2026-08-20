import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';
import { TokenType, UserRole } from '../generated/prisma/enums';
import { UserStatus } from '../generated/prisma/client';

describe('AdminUsersService', () => {
  let service: AdminUsersService;
  let prisma: {
    user: {
      findMany: jest.Mock;
      findFirst: jest.Mock;
      count: jest.Mock;
      update: jest.Mock;
    };
    authToken: { deleteMany: jest.Mock };
    authSession: { updateMany: jest.Mock };
    $transaction: jest.Mock;
  };
  let audit: { log: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        count: jest.fn(),
        update: jest.fn(),
      },
      authToken: { deleteMany: jest.fn().mockResolvedValue({ count: 1 }) },
      authSession: { updateMany: jest.fn().mockResolvedValue({ count: 2 }) },
      $transaction: jest.fn((fn: (tx: typeof prisma) => Promise<unknown>) =>
        fn(prisma),
      ),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new AdminUsersService(
      prisma as never,
      audit as never,
      {
        resetMfaForUser: jest.fn().mockResolvedValue({ reset: true }),
      } as never,
    );
  });

  it('setUserRole throws when user missing', async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(
      service.setUserRole('a1', UserRole.ADMIN, 'missing', UserRole.CUSTOMER),
    ).rejects.toThrow(NotFoundException);
  });

  it('setUserRole returns unchanged when role already matches', async () => {
    const row = {
      id: 'u1',
      email: 'a@x.com',
      firstName: 'A',
      lastName: 'B',
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      emailVerifiedAt: null,
    };
    prisma.user.findFirst.mockResolvedValue(row);
    const result = await service.setUserRole(
      'admin',
      UserRole.ADMIN,
      'u1',
      UserRole.CUSTOMER,
    );
    expect(result).toEqual(row);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
  });

  it('setUserRole blocks demoting the last admin', async () => {
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: 'admin@x.com',
      firstName: 'A',
      lastName: 'B',
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      emailVerifiedAt: null,
    });
    prisma.user.count.mockResolvedValue(1);
    await expect(
      service.setUserRole('a1', UserRole.ADMIN, 'u1', UserRole.CUSTOMER),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('setUserRole updates role, clears refresh tokens and sessions, audits', async () => {
    const before = {
      id: 'u2',
      email: 'b@x.com',
      firstName: 'B',
      lastName: 'C',
      role: UserRole.CUSTOMER,
      status: UserStatus.ACTIVE,
      createdAt: new Date(),
      emailVerifiedAt: null,
    };
    const after = { ...before, role: UserRole.ADMIN };
    prisma.user.findFirst.mockResolvedValue(before);
    prisma.user.update.mockResolvedValue(after);

    const result = await service.setUserRole(
      'admin-1',
      UserRole.ADMIN,
      'u2',
      UserRole.ADMIN,
    );

    expect(result.role).toBe(UserRole.ADMIN);
    expect(prisma.authToken.deleteMany).toHaveBeenCalledWith({
      where: { userId: 'u2', tokenType: TokenType.REFRESH },
    });
    expect(prisma.authSession.updateMany).toHaveBeenCalledWith({
      where: { userId: 'u2', revokedAt: null },
      data: { revokedAt: expect.any(Date) },
    });
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'admin.user.role_updated',
        entityId: 'u2',
        before: { role: UserRole.CUSTOMER },
        after: { role: UserRole.ADMIN },
      }),
    );
  });

  it('resetUserMfa delegates to AdminMfaService', async () => {
    const adminMfa = {
      resetMfaForUser: jest.fn().mockResolvedValue({ reset: true }),
    };
    const svc = new AdminUsersService(
      prisma as never,
      audit as never,
      adminMfa as never,
    );
    await expect(
      svc.resetUserMfa('actor', UserRole.ADMIN, 'target'),
    ).resolves.toEqual({ reset: true });
    expect(adminMfa.resetMfaForUser).toHaveBeenCalledWith(
      'actor',
      UserRole.ADMIN,
      'target',
    );
  });
});
