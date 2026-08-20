import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

describe('AppController', () => {
  let appController: AppController;
  let mockPrisma: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
    };

    const mockConfig = {
      get: jest.fn((key: string, fallback?: string | number) => {
        const map: Record<string, string | number> = {
          REDIS_HOST: '127.0.0.1',
          REDIS_PORT: 1,
          REDIS_DB: 0,
        };
        return map[key] ?? fallback;
      }),
    };

    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: ConfigService, useValue: mockConfig },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('getHealth', () => {
    it('should return status and database connected', async () => {
      const result = await appController.getHealth();
      expect(result).toMatchObject({
        status: 'ok',
        database: 'connected',
      });
      expect(result).toHaveProperty('timestamp');
      expect(result).toHaveProperty('uptime');
      expect(result).toHaveProperty('role');
    });
  });

  describe('getLive', () => {
    it('returns ok without dependency checks', () => {
      expect(appController.getLive()).toMatchObject({ status: 'ok' });
    });
  });

  describe('getReady', () => {
    it('throws when redis is unreachable', async () => {
      await expect(appController.getReady()).rejects.toMatchObject({
        status: 503,
      });
    });
  });
});
