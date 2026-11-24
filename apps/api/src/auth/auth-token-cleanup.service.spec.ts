import { Test, TestingModule } from '@nestjs/testing';
import { AuthTokenCleanupService } from './auth-token-cleanup.service';
import { PrismaService } from '../prisma/prisma.service';
import { ObservabilityService } from '../observability/observability.service';

describe('AuthTokenCleanupService', () => {
  let service: AuthTokenCleanupService;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const mockPrisma = {
      authToken: {
        deleteMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      authSession: {
        deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      pendingSignup: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthTokenCleanupService,
        {
          provide: ObservabilityService,
          useValue: {
            startSpan: jest.fn(
              async (
                _name: string,
                _attributes: Record<string, unknown>,
                callback: () => Promise<unknown>,
              ) => callback(),
            ),
          },
        },
        { provide: PrismaService, useValue: mockPrisma },
      ],
    }).compile();

    service = module.get<AuthTokenCleanupService>(AuthTokenCleanupService);
    prisma = module.get(PrismaService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('handleExpiredTokensCleanup', () => {
    it('should delete expired auth tokens and stale sessions', async () => {
      await service.handleExpiredTokensCleanup();

      expect(prisma.authToken.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
      expect(prisma.authSession.deleteMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { expiresAt: { lt: expect.any(Date) } },
            {
              AND: [
                { revokedAt: { not: null } },
                { revokedAt: { lt: expect.any(Date) } },
              ],
            },
          ],
        },
      });
    });

    it('deletes a pending sign-up only once its code has expired and its hourly send window has ended (TTW-254)', async () => {
      const before = Date.now();
      await service.handleExpiredTokensCleanup();

      const call = (prisma.pendingSignup.deleteMany as jest.Mock).mock
        .calls[0][0] as {
        where: { expiresAt: { lt: Date }; windowStartedAt: { lt: Date } };
      };
      expect(call.where.expiresAt.lt).toBeInstanceOf(Date);
      // The window cutoff is an hour before now, so the send cap survives until then.
      const hourMs = 60 * 60 * 1000;
      expect(call.where.windowStartedAt.lt.getTime()).toBeLessThanOrEqual(
        Date.now() - hourMs + 1000,
      );
      expect(call.where.windowStartedAt.lt.getTime()).toBeGreaterThanOrEqual(
        before - hourMs - 1000,
      );
    });

    it('logs the count of expired pending sign-ups and nothing else about them (TTW-254)', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();
      (prisma.authToken.deleteMany as jest.Mock).mockResolvedValue({
        count: 0,
      });
      (prisma.authSession.deleteMany as jest.Mock).mockResolvedValue({
        count: 0,
      });
      (prisma.pendingSignup.deleteMany as jest.Mock).mockResolvedValue({
        count: 2,
      });

      await service.handleExpiredTokensCleanup();

      expect(logSpy).toHaveBeenCalledWith(
        'Deleted 2 expired pending sign-up(s)',
      );
    });

    it('should log when tokens are deleted', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();
      (prisma.authToken.deleteMany as jest.Mock).mockResolvedValue({
        count: 5,
      });
      (prisma.authSession.deleteMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      await service.handleExpiredTokensCleanup();

      expect(logSpy).toHaveBeenCalledWith('Deleted 5 expired auth token(s)');
    });

    it('should log when sessions are deleted', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();
      (prisma.authToken.deleteMany as jest.Mock).mockResolvedValue({
        count: 0,
      });
      (prisma.authSession.deleteMany as jest.Mock).mockResolvedValue({
        count: 4,
      });

      await service.handleExpiredTokensCleanup();

      expect(logSpy).toHaveBeenCalledWith(
        'Deleted 4 expired/revoked auth session(s)',
      );
    });

    it('should not log when nothing deleted', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();
      (prisma.authToken.deleteMany as jest.Mock).mockResolvedValue({
        count: 0,
      });
      (prisma.authSession.deleteMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      await service.handleExpiredTokensCleanup();

      expect(logSpy).not.toHaveBeenCalled();
    });
  });
});
