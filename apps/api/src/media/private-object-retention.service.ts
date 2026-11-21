import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { runWithRequestContext } from '../request-context/request-context.store';
import { S3Service } from '../storage/s3.service';
import { MediaAssetStatus } from '../generated/prisma/enums';

/**
 * Retention of private customer objects (TTW-235). Confirmed by the user on 2026-11-20:
 * - rejected by moderation: deleted 14 days after the latest decision. With an appeal
 *   pending the file is kept; once the appeal is answered the answer is a new latest
 *   decision, so the same 14 days then count from the answer;
 * - never attached to a design, or stuck PENDING/PROCESSING/FAILED: deleted after 7 days.
 * Infected files are already deleted at once by `MediaProcessor`.
 */
export const REJECTED_RETENTION_DAYS = 14;
export const ORPHAN_RETENTION_DAYS = 7;
export const RETENTION_BATCH_SIZE = 200;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface RetentionRunSummary {
  selected: number;
  deleted: number;
  failed: number;
}

@Injectable()
export class PrivateObjectRetentionService {
  private readonly logger = new Logger(PrivateObjectRetentionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly s3: S3Service,
  ) {}

  /** Daily, Africa/Lagos 02:30. Cron jobs only run on the scheduler role. */
  @Cron('30 2 * * *', { timeZone: 'Africa/Lagos' })
  async runDaily(): Promise<void> {
    const now = new Date();
    await runWithRequestContext(
      {
        requestId: `cron:private-object-retention:${now.toISOString()}`,
        source: 'CRON',
      },
      async () => {
        try {
          await this.runOnce(now);
        } catch {
          this.logger.error('Private object retention run failed');
        }
      },
    );
  }

  /**
   * One bounded pass. Idempotent: eligibility is read from the database state, a key that
   * is already gone counts as deleted, and the database is only changed after the storage
   * delete succeeded. No transaction is open during a storage call.
   */
  async runOnce(
    now: Date = new Date(),
    options?: { batchSize?: number },
  ): Promise<RetentionRunSummary> {
    const batchSize = options?.batchSize ?? RETENTION_BATCH_SIZE;
    const ids = await this.selectEligibleAssetIds(now, batchSize);
    const summary: RetentionRunSummary = {
      selected: ids.length,
      deleted: 0,
      failed: 0,
    };

    for (const id of ids) {
      const outcome = await this.purgeAsset(id);
      if (outcome === 'deleted') summary.deleted += 1;
      if (outcome === 'failed') summary.failed += 1;
    }

    if (summary.selected > 0) {
      this.logger.log(
        `Private object retention: selected=${summary.selected} deleted=${summary.deleted} failed=${summary.failed}`,
      );
    }
    return summary;
  }

  /**
   * Random order on purpose: assets whose storage delete keeps failing must not stay at the
   * head of a fixed order and starve the rest of the batch.
   */
  private async selectEligibleAssetIds(
    now: Date,
    limit: number,
  ): Promise<string[]> {
    const rejectedCutoff = new Date(
      now.getTime() - REJECTED_RETENTION_DAYS * DAY_MS,
    ).toISOString();
    const orphanCutoff = new Date(
      now.getTime() - ORPHAN_RETENTION_DAYS * DAY_MS,
    ).toISOString();

    const rows = await this.prisma.$queryRaw<{ id: string }[]>`
      SELECT a."id"
      FROM "media_assets" a
      WHERE a."visibility" = 'PRIVATE'
        AND (
          a."originalKey" IS NOT NULL
          OR EXISTS (SELECT 1 FROM "media_derivatives" d WHERE d."assetId" = a."id")
        )
        AND NOT EXISTS (SELECT 1 FROM "product_images" p WHERE p."mediaAssetId" = a."id")
        AND (
          (
            a."moderationStatus" = 'REJECTED'
            AND EXISTS (
              SELECT 1 FROM (
                SELECT md."outcome", md."createdAt"
                FROM "moderation_decisions" md
                WHERE md."subjectType" = 'MEDIA' AND md."subjectId" = a."id"
                ORDER BY md."createdAt" DESC, md."id" DESC
                LIMIT 1
              ) latest
              WHERE latest."outcome" = 'REJECTED'
                AND latest."createdAt" < (${rejectedCutoff}::timestamptz AT TIME ZONE 'UTC')
            )
            AND NOT EXISTS (
              SELECT 1
              FROM "moderation_appeals" ap
              JOIN "moderation_decisions" ad ON ad."id" = ap."decisionId"
              WHERE ad."subjectType" = 'MEDIA'
                AND ad."subjectId" = a."id"
                AND ap."status" IN ('PENDING', 'ESCALATED')
            )
          )
          OR (
            a."moderationStatus" <> 'REJECTED'
            AND (
              (
                a."createdAt" < (${orphanCutoff}::timestamptz AT TIME ZONE 'UTC')
                AND NOT EXISTS (SELECT 1 FROM "design_assets" da WHERE da."mediaAssetId" = a."id")
              )
              OR (
                a."status" IN ('PENDING', 'PROCESSING', 'FAILED')
                AND a."updatedAt" < (${orphanCutoff}::timestamptz AT TIME ZONE 'UTC')
              )
            )
          )
        )
      ORDER BY random()
      LIMIT ${limit}
    `;
    return rows.map((r) => r.id);
  }

  private async purgeAsset(
    id: string,
  ): Promise<'deleted' | 'failed' | 'skipped'> {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
      select: {
        originalKey: true,
        derivatives: { select: { key: true } },
      },
    });
    if (!asset) return 'skipped';

    const keys = new Set<string>(asset.derivatives.map((d) => d.key));
    if (asset.originalKey) keys.add(asset.originalKey);
    if (keys.size === 0) return 'skipped';

    try {
      for (const key of keys) {
        await this.s3.deletePrivateObject(key);
      }
    } catch {
      // Keep the row: the next run retries. No key or link in the log.
      this.logger.error(`Storage delete failed for asset ${id}`);
      return 'failed';
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.mediaDerivative.deleteMany({ where: { assetId: id } });
      await tx.mediaAsset.updateMany({
        where: { id, visibility: 'PRIVATE' },
        data: { originalKey: null },
      });
      // A READY asset without a file must not look usable.
      await tx.mediaAsset.updateMany({
        where: {
          id,
          visibility: 'PRIVATE',
          status: { not: MediaAssetStatus.FAILED },
        },
        data: {
          status: MediaAssetStatus.FAILED,
          errorMessage: 'File deleted after the retention period',
        },
      });
    });
    return 'deleted';
  }
}
