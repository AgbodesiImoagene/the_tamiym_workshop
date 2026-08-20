import { PrismaService } from './prisma.service';

describe('PrismaService.withSessionAdvisoryLock', () => {
  function buildWithPool(connect: jest.Mock): PrismaService {
    const service = Object.create(PrismaService.prototype) as PrismaService;
    Object.defineProperty(service, 'pool', {
      value: { connect },
      configurable: true,
    });
    return service;
  }

  it('runs fn when lock acquired and unlocks on the same client', async () => {
    const query = jest
      .fn()
      .mockResolvedValueOnce({ rows: [{ locked: true }] })
      .mockResolvedValueOnce({ rows: [{ unlocked: true }] });
    const release = jest.fn();
    const connect = jest.fn().mockResolvedValue({ query, release });
    const service = buildWithPool(connect);

    const result = await service.withSessionAdvisoryLock('recon:test', () =>
      Promise.resolve(42),
    );
    expect(result).toBe(42);
    expect(query).toHaveBeenCalledTimes(2);
    expect(release).toHaveBeenCalled();
  });

  it('returns null when lock is held', async () => {
    const query = jest.fn().mockResolvedValue({ rows: [{ locked: false }] });
    const release = jest.fn();
    const connect = jest.fn().mockResolvedValue({ query, release });
    const service = buildWithPool(connect);

    const result = await service.withSessionAdvisoryLock('recon:test', () =>
      Promise.resolve(1),
    );
    expect(result).toBeNull();
    expect(query).toHaveBeenCalledTimes(1);
    expect(release).toHaveBeenCalled();
  });
});
