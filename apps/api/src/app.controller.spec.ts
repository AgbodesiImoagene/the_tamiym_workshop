import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { ServiceUnavailableException } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

const redisState = {
  pingResult: 'PONG' as string,
  connectShouldFail: false,
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockImplementation(() => {
      if (redisState.connectShouldFail) {
        return Promise.reject(new Error('redis down'));
      }
      return Promise.resolve();
    }),
    ping: jest
      .fn()
      .mockImplementation(() => Promise.resolve(redisState.pingResult)),
    quit: jest.fn().mockResolvedValue('OK'),
    disconnect: jest.fn(),
  }));
});

describe('AppController', () => {
  let appController: AppController;
  let mockPrisma: { $queryRaw: jest.Mock };

  beforeEach(async () => {
    redisState.pingResult = 'PONG';
    redisState.connectShouldFail = false;
    mockPrisma = {
      $queryRaw: jest.fn().mockResolvedValue(undefined),
    };

    const mockConfig = {
      get: jest.fn((key: string, fallback?: string | number) => {
        const map: Record<string, string | number> = {
          REDIS_HOST: '127.0.0.1',
          REDIS_PORT: 6379,
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
        redis: 'connected',
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
    it('returns ok when database and redis are connected', async () => {
      await expect(appController.getReady()).resolves.toMatchObject({
        status: 'ok',
        database: 'connected',
        redis: 'connected',
      });
    });

    it('throws when redis is unreachable', async () => {
      redisState.connectShouldFail = true;
      await expect(appController.getReady()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it('throws when database is unreachable', async () => {
      mockPrisma.$queryRaw.mockRejectedValueOnce(new Error('db down'));
      await expect(appController.getReady()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
