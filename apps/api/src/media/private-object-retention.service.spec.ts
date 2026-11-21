import { PrivateObjectRetentionService } from './private-object-retention.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';

const NOW = new Date('2026-12-01T03:00:00.000Z');

function setup(options?: { ids?: string[] }) {
  const ids = options?.ids ?? [];
  const assets: Record<
    string,
    { originalKey: string | null; derivatives: { key: string }[] }
  > = {
    a1: {
      originalKey: 'media/a1/original.png',
      derivatives: [
        { key: 'media/a1/display.webp' },
        { key: 'media/a1/thumb.webp' },
      ],
    },
    a2: { originalKey: 'media/a2/original.png', derivatives: [] },
    a3: { originalKey: null, derivatives: [{ key: 'media/a3/thumb.webp' }] },
  };
  const tx = {
    mediaDerivative: { deleteMany: jest.fn().mockResolvedValue({ count: 2 }) },
    mediaAsset: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
  };
  const prisma = {
    $queryRaw: jest.fn().mockResolvedValue(ids.map((id) => ({ id }))),
    mediaAsset: {
      findUnique: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(assets[where.id] ?? null),
      ),
    },
    $transaction: jest.fn((fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  };
  const s3 = { deletePrivateObject: jest.fn().mockResolvedValue(undefined) };
  const service = new PrivateObjectRetentionService(
    prisma as unknown as PrismaService,
    s3 as unknown as S3Service,
  );
  return { service, prisma, s3, tx };
}

describe('PrivateObjectRetentionService (TTW-235)', () => {
  it('does nothing when no asset is eligible', async () => {
    const { service, s3, prisma } = setup();
    await expect(service.runOnce(NOW)).resolves.toEqual({
      selected: 0,
      deleted: 0,
      failed: 0,
    });
    expect(s3.deletePrivateObject).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('deletes the original and every derivative, then clears the database', async () => {
    const { service, s3, tx } = setup({ ids: ['a1'] });
    const summary = await service.runOnce(NOW);
    expect(summary).toEqual({ selected: 1, deleted: 1, failed: 0 });
    expect(s3.deletePrivateObject.mock.calls.map((c) => c[0]).sort()).toEqual([
      'media/a1/display.webp',
      'media/a1/original.png',
      'media/a1/thumb.webp',
    ]);
    expect(tx.mediaDerivative.deleteMany).toHaveBeenCalledWith({
      where: { assetId: 'a1' },
    });
    expect(tx.mediaAsset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'a1' }) as unknown,
        data: expect.objectContaining({ originalKey: null }) as unknown,
      }),
    );
  });

  it('handles an asset that has derivatives but no original key', async () => {
    const { service, s3 } = setup({ ids: ['a3'] });
    await service.runOnce(NOW);
    expect(s3.deletePrivateObject).toHaveBeenCalledTimes(1);
    expect(s3.deletePrivateObject).toHaveBeenCalledWith('media/a3/thumb.webp');
  });

  it('keeps the database row when the storage delete fails, and goes on with the next asset', async () => {
    const { service, s3, tx } = setup({ ids: ['a1', 'a2'] });
    s3.deletePrivateObject.mockImplementation((key: string) =>
      key.startsWith('media/a1/')
        ? Promise.reject(new Error('storage down'))
        : Promise.resolve(undefined),
    );
    const summary = await service.runOnce(NOW);
    expect(summary).toEqual({ selected: 2, deleted: 1, failed: 1 });
    for (const [arg] of tx.mediaAsset.updateMany.mock.calls as [
      { where: { id: string } },
    ][]) {
      expect(arg.where.id).toBe('a2');
    }
    expect(tx.mediaAsset.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'a2' }) as unknown,
      }),
    );
  });

  it('never holds a database transaction open during a storage call', async () => {
    const { service, s3, prisma } = setup({ ids: ['a1'] });
    let inTx = false;
    (prisma.$transaction as jest.Mock).mockImplementation(
      async (fn: (t: unknown) => Promise<unknown>) => {
        inTx = true;
        try {
          return await fn({
            mediaDerivative: { deleteMany: jest.fn() },
            mediaAsset: { updateMany: jest.fn() },
          });
        } finally {
          inTx = false;
        }
      },
    );
    s3.deletePrivateObject.mockImplementation(() => {
      expect(inTx).toBe(false);
      return Promise.resolve();
    });
    await service.runOnce(NOW);
    expect(s3.deletePrivateObject).toHaveBeenCalled();
  });

  it('skips an asset that disappeared between the selection and the delete', async () => {
    const { service, s3 } = setup({ ids: ['gone'] });
    const summary = await service.runOnce(NOW);
    expect(summary).toEqual({ selected: 1, deleted: 0, failed: 0 });
    expect(s3.deletePrivateObject).not.toHaveBeenCalled();
  });

  it('logs ids and counts only, never a storage key', async () => {
    const { service, s3 } = setup({ ids: ['a1'] });
    s3.deletePrivateObject.mockRejectedValueOnce(new Error('boom'));
    const logs: string[] = [];
    const logger = (service as unknown as { logger: Record<string, unknown> })
      .logger;
    for (const m of ['log', 'warn', 'error']) {
      jest.spyOn(logger as never, m as never).mockImplementation(((
        msg: unknown,
      ) => {
        logs.push(String(msg));
      }) as never);
    }
    await service.runOnce(NOW);
    expect(logs.length).toBeGreaterThan(0);
    for (const line of logs) expect(line).not.toContain('media/');
  });
});
