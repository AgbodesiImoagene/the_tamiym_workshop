/**
 * One-off, idempotent clean-up for TTW-237 (no production data yet, so no copy of the old
 * pictures): thumbnails used to be public objects at `thumbnails/<designId>/thumb.*`, with the
 * storage address (or any client-supplied address) in `Design.thumbnailUrl`.
 *
 * - every `thumbnailUrl` that is not the new API path (`/designs/<id>/thumbnail`) is cleared;
 * - every object under `thumbnails/` in the PUBLIC bucket is deleted.
 *
 * Thumbnails come back at the next save in the workshop, which uploads one each time.
 */
export const LEGACY_PUBLIC_THUMBNAIL_PREFIX = 'thumbnails/';

interface Deps {
  prisma: {
    design: {
      updateMany(args: object): Promise<{ count: number }>;
      count(args: object): Promise<number>;
    };
  };
  s3: {
    listObjectKeys(prefix: string): Promise<string[]>;
    deleteObject(key: string): Promise<void>;
  };
}

export async function migrateDesignThumbnails(
  { prisma, s3 }: Deps,
  options: { dryRun: boolean },
): Promise<{ designsCleared: number; publicObjectsDeleted: number }> {
  const legacyWhere = {
    thumbnailUrl: { not: null },
    NOT: { thumbnailUrl: { startsWith: '/designs/' } },
  };

  const keys = (await s3.listObjectKeys(LEGACY_PUBLIC_THUMBNAIL_PREFIX)).filter(
    (key) => key.startsWith(LEGACY_PUBLIC_THUMBNAIL_PREFIX),
  );

  if (options.dryRun) {
    return {
      designsCleared: await prisma.design.count({ where: legacyWhere }),
      publicObjectsDeleted: keys.length,
    };
  }

  const { count } = await prisma.design.updateMany({
    where: legacyWhere,
    data: { thumbnailUrl: null },
  });
  for (const key of keys) {
    await s3.deleteObject(key);
  }
  return { designsCleared: count, publicObjectsDeleted: keys.length };
}
