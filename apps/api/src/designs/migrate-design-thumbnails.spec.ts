import { migrateDesignThumbnails } from './migrate-design-thumbnails';

function makeDeps(keys: string[], legacyCount: number) {
  const deleted: string[] = [];
  const updateMany = jest.fn().mockResolvedValue({ count: legacyCount });
  const count = jest.fn().mockResolvedValue(legacyCount);
  return {
    deleted,
    updateMany,
    count,
    deps: {
      prisma: { design: { updateMany, count } },
      s3: {
        listObjectKeys: jest.fn().mockResolvedValue(keys),
        deleteObject: jest.fn((k: string) => {
          deleted.push(k);
          return Promise.resolve();
        }),
      },
    },
  };
}

describe('migrateDesignThumbnails (TTW-237)', () => {
  it('clears every thumbnail that is not the new API path and empties thumbnails/ in the public bucket', async () => {
    const { deps, deleted, updateMany } = makeDeps(
      ['thumbnails/a/thumb.webp', 'thumbnails/b/thumb.png'],
      3,
    );

    const result = await migrateDesignThumbnails(deps as never, {
      dryRun: false,
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        thumbnailUrl: { not: null },
        NOT: { thumbnailUrl: { startsWith: '/designs/' } },
      },
      data: { thumbnailUrl: null },
    });
    expect(deps.s3.listObjectKeys).toHaveBeenCalledWith('thumbnails/');
    expect(deleted).toEqual([
      'thumbnails/a/thumb.webp',
      'thumbnails/b/thumb.png',
    ]);
    expect(result).toEqual({ designsCleared: 3, publicObjectsDeleted: 2 });
  });

  it('changes nothing in a dry run, and reports what it would do', async () => {
    const { deps, deleted, updateMany } = makeDeps(
      ['thumbnails/a/thumb.webp'],
      2,
    );

    const result = await migrateDesignThumbnails(deps as never, {
      dryRun: true,
    });

    expect(updateMany).not.toHaveBeenCalled();
    expect(deleted).toEqual([]);
    expect(result).toEqual({ designsCleared: 2, publicObjectsDeleted: 1 });
  });

  it('is idempotent: a second run finds nothing to do', async () => {
    const { deps } = makeDeps([], 0);
    const result = await migrateDesignThumbnails(deps as never, {
      dryRun: false,
    });
    expect(result).toEqual({ designsCleared: 0, publicObjectsDeleted: 0 });
  });

  it('never touches keys outside thumbnails/', async () => {
    const { deps, deleted } = makeDeps(
      ['thumbnails/a/thumb.webp', 'media/keep/original.png'],
      0,
    );
    await migrateDesignThumbnails(deps as never, { dryRun: false });
    expect(deleted).toEqual(['thumbnails/a/thumb.webp']);
  });
});
