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
    it('should delete expired auth tokens', async () => {
      await service.handleExpiredTokensCleanup();

      expect(prisma.authToken.deleteMany).toHaveBeenCalledWith({
        where: { expiresAt: { lt: expect.any(Date) } },
      });
    });

    it('should log when tokens are deleted', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();
      (prisma.authToken.deleteMany as jest.Mock).mockResolvedValue({
        count: 5,
      });

      await service.handleExpiredTokensCleanup();

      expect(logSpy).toHaveBeenCalledWith('Deleted 5 expired auth token(s)');
    });

    it('should not log when no tokens deleted', async () => {
      const logSpy = jest.spyOn(service['logger'], 'log').mockImplementation();
      (prisma.authToken.deleteMany as jest.Mock).mockResolvedValue({
        count: 0,
      });

      await service.handleExpiredTokensCleanup();

      expect(logSpy).not.toHaveBeenCalled();
    });
  });
});
