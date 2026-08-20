import { HttpException, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

const redisMock = {
  incr: jest.fn(),
  pexpire: jest.fn(),
  eval: jest.fn(),
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue('OK'),
  disconnect: jest.fn(),
  status: 'wait',
};

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => redisMock);
});

import { AuthRateLimitService } from './auth-rate-limit.service';

describe('AuthRateLimitService', () => {
  const observability = {
    recordAuthThrottle: jest.fn(),
  };

  let service: AuthRateLimitService;

  beforeEach(() => {
    jest.clearAllMocks();
    redisMock.quit.mockResolvedValue('OK');
    service = new AuthRateLimitService(
      {
        get: (key: string, fallback?: string | number) => {
          if (key === 'REDIS_HOST') return '127.0.0.1';
          if (key === 'REDIS_PORT') return 6379;
          if (key === 'REDIS_DB') return 15;
          return fallback;
        },
      } as ConfigService,
      observability as never,
    );
  });

  afterEach(async () => {
    await service.onModuleDestroy();
  });

  it('allows traffic under both identity and IP limits', async () => {
    redisMock.eval.mockResolvedValueOnce(1).mockResolvedValueOnce(1);

    await expect(
      service.consume({
        bucket: 'admin_login',
        email: 'Ada@Example.com',
        ip: '127.0.0.1',
        surface: 'ADMIN',
      }),
    ).resolves.toBeUndefined();

    expect(observability.recordAuthThrottle).toHaveBeenCalledWith({
      surface: 'ADMIN',
      bucket: 'admin_login',
      outcome: 'allowed',
    });
    expect(redisMock.eval).toHaveBeenCalled();
  });

  it('limits when identity counter exceeds bucket limit', async () => {
    redisMock.eval.mockResolvedValueOnce(6).mockResolvedValueOnce(1);

    await expect(
      service.consume({
        bucket: 'admin_login',
        email: 'ada@example.com',
        ip: '127.0.0.1',
        surface: 'ADMIN',
      }),
    ).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(observability.recordAuthThrottle).toHaveBeenCalledWith({
      surface: 'ADMIN',
      bucket: 'admin_login',
      outcome: 'limited',
    });
  });

  it('fail-closes when Redis is unavailable', async () => {
    redisMock.eval.mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(
      service.consume({
        bucket: 'customer_auth',
        email: 'user@example.com',
        ip: '127.0.0.1',
        surface: 'CUSTOMER',
      }),
    ).rejects.toBeInstanceOf(HttpException);

    expect(observability.recordAuthThrottle).toHaveBeenCalledWith({
      surface: 'CUSTOMER',
      bucket: 'customer_auth',
      outcome: 'unavailable',
    });
  });
});
