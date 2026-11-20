import { Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import sharp from 'sharp';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import {
  MediaAssetStatus,
  MediaDerivativeType,
  MediaSourceType,
  MediaVisibility,
  ModerationStatus,
  ModerationSubjectType,
  VirusScanStatus,
} from '../generated/prisma/enums';
import { ModerationService } from '../moderation/moderation.service';
import { ModerationDecisionService } from '../moderation/moderation-decision.service';
import {
  aiReasonCodesForOutcome,
  hashRevision,
} from '../moderation/moderation.constants';
import { VirusScanService } from './virus-scan.service';
import { ObservabilityService } from '../observability/observability.service';
import { runWithRequestContext } from '../request-context/request-context.store';
import {
  MEDIA_DISPLAY_MAX,
  MEDIA_MAX_BYTES,
  MEDIA_QUEUE,
  MEDIA_SHARP_LIMIT_INPUT_PIXELS,
  MEDIA_SUPPORTED_MIME_TYPES,
  MEDIA_THUMB_MAX,
} from './media.constants';
import { bullProcessorOptions } from '../queues/bull-processor.options';
import { identifyImageBuffer } from './image-identify';
import { SafeRemoteMediaFetcher } from './safe-remote-fetch';

const MEDIA_SHARP_OPTIONS = {
  failOn: 'error' as const,
  limitInputPixels: MEDIA_SHARP_LIMIT_INPUT_PIXELS,
};

@Processor(MEDIA_QUEUE, bullProcessorOptions)
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
    private virusScanService: VirusScanService,
    private moderationService: ModerationService,
    private moderationDecisions: ModerationDecisionService,
    private observability: ObservabilityService,
    private safeRemoteFetcher: SafeRemoteMediaFetcher,
  ) {
    super();
  }

  async process(job: Job<{ assetId: string }>) {
    const startedAt = process.hrtime.bigint();
    return runWithRequestContext(
      {
        requestId: `worker:${MEDIA_QUEUE}:${job.id ?? job.name}`,
        source: 'WORKER',
      },
      async () => {
        const { assetId } = job.data;
        const asset = await this.prisma.mediaAsset.findUnique({
          where: { id: assetId },
        });
        if (!asset) {
          this.logger.warn(`Media asset not found: ${assetId}`);
          return;
        }

        if (asset.status === MediaAssetStatus.READY) {
          return;
        }

        await this.prisma.mediaAsset.update({
          where: { id: assetId },
          data: { status: MediaAssetStatus.PROCESSING },
        });

        try {
          const { buffer, originalKey, originalUrl } = await this.loadOriginal(
            assetId,
            asset,
          );
          if (buffer.length > MEDIA_MAX_BYTES) {
            throw new Error('File is too large');
          }

          // Scan raw bytes before any sharp decode (quarantine order).
          const scanStatus = await this.virusScanService.scanBuffer(buffer);
          if (scanStatus !== VirusScanStatus.CLEAN) {
            const errorMessage =
              scanStatus === VirusScanStatus.INFECTED
                ? 'Virus scan detected malware'
                : 'Virus scan failed';
            await this.prisma.mediaAsset.update({
              where: { id: assetId },
              data: {
                scanStatus,
                originalBytes: buffer.length,
                status: MediaAssetStatus.FAILED,
                errorMessage,
              },
            });
            return;
          }

          const identified = await identifyImageBuffer(buffer);
          const mimeType = identified.mimeType;

          // AI moderation. A PRIVATE (customer) asset is moderated from its bytes sent
          // inline: no link, public or signed, ever leaves the system (TTW-099).
          // A PUBLIC asset uses its public URL if available, otherwise skips the image check.
          // REJECTED → fail the asset (blocks use); FLAGGED → mark for human review but
          // keep the asset READY so the user's upload is not silently lost.
          const isPrivate = asset.visibility === MediaVisibility.PRIVATE;
          let displayBuffer: Buffer | undefined;
          let moderationResult;
          if (isPrivate) {
            displayBuffer = await this.buildDisplayBuffer(buffer);
            moderationResult = await this.moderationService.moderateImageBytes(
              displayBuffer,
              'image/webp',
            );
          } else {
            const assetForMod = await this.prisma.mediaAsset.findUnique({
              where: { id: assetId },
              select: { originalUrl: true },
            });
            moderationResult = assetForMod?.originalUrl
              ? await this.moderationService.moderateImage(
                  assetForMod.originalUrl,
                )
              : {
                  status: ModerationStatus.PENDING,
                  notes: 'No URL available for moderation',
                  maxScore: 0,
                };
          }

          if (moderationResult.status === ModerationStatus.REJECTED) {
            await this.prisma.$transaction(async (tx) => {
              await this.moderationDecisions.recordAiDecisionInTx(tx, {
                subjectType: ModerationSubjectType.MEDIA,
                subjectId: assetId,
                outcome: ModerationStatus.REJECTED,
                notes: moderationResult.notes,
                maxScore: moderationResult.maxScore,
                revisionHash: hashRevision({
                  originalKey,
                  bytes: buffer.length,
                }),
                reasonCodes: aiReasonCodesForOutcome(
                  ModerationStatus.REJECTED,
                  moderationResult.notes,
                ),
                withdrawPendingAppeals: true,
              });
              await tx.mediaAsset.update({
                where: { id: assetId },
                data: {
                  status: MediaAssetStatus.FAILED,
                  errorMessage: 'Asset rejected by content moderation',
                },
              });
            });
            this.logger.warn(
              `Asset ${assetId} auto-rejected by AI moderation: ${moderationResult.notes}`,
            );
            return;
          }

          await this.prisma.mediaAsset.update({
            where: { id: assetId },
            data: {
              originalMime: mimeType,
              originalBytes: buffer.length,
              originalWidth: identified.width,
              originalHeight: identified.height,
              scanStatus,
            },
          });
          await this.prisma.mediaDerivative.upsert({
            where: {
              assetId_type: { assetId, type: MediaDerivativeType.ORIGINAL },
            },
            update: {
              key: originalKey,
              url: originalUrl,
              mimeType,
              sizeBytes: buffer.length,
              width: identified.width,
              height: identified.height,
            },
            create: {
              assetId,
              type: MediaDerivativeType.ORIGINAL,
              key: originalKey,
              url: originalUrl,
              mimeType,
              sizeBytes: buffer.length,
              width: identified.width,
              height: identified.height,
            },
          });

          displayBuffer ??= await this.buildDisplayBuffer(buffer);

          const thumbBuffer = await sharp(buffer, MEDIA_SHARP_OPTIONS)
            .rotate()
            .resize({
              width: MEDIA_THUMB_MAX,
              height: MEDIA_THUMB_MAX,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .webp({ quality: 80 })
            .toBuffer();

          await this.saveDerivative(
            assetId,
            MediaDerivativeType.DISPLAY,
            displayBuffer,
            asset.visibility,
          );
          await this.saveDerivative(
            assetId,
            MediaDerivativeType.THUMB,
            thumbBuffer,
            asset.visibility,
          );

          await this.prisma.$transaction(async (tx) => {
            await tx.mediaAsset.update({
              where: { id: assetId },
              data: {
                status: MediaAssetStatus.READY,
                scanStatus,
                errorMessage: null,
              },
            });
            await this.moderationDecisions.recordAiDecisionInTx(tx, {
              subjectType: ModerationSubjectType.MEDIA,
              subjectId: assetId,
              outcome: moderationResult.status,
              notes: moderationResult.notes,
              maxScore: moderationResult.maxScore,
              revisionHash: hashRevision({
                originalKey,
                bytes: buffer.length,
              }),
              reasonCodes: aiReasonCodesForOutcome(
                moderationResult.status,
                moderationResult.notes,
              ),
              withdrawPendingAppeals: true,
            });
          });
          this.observability.recordQueueJob({
            queue: MEDIA_QUEUE,
            jobName: job.name,
            outcome: 'success',
            durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Failed to process media';
          await this.prisma.mediaAsset.update({
            where: { id: assetId },
            data: {
              status: MediaAssetStatus.FAILED,
              scanStatus: VirusScanStatus.FAILED,
              errorMessage: message,
            },
          });
          this.observability.recordQueueJob({
            queue: MEDIA_QUEUE,
            jobName: job.name,
            outcome: 'failure',
            durationMs: Number(process.hrtime.bigint() - startedAt) / 1_000_000,
          });
          this.logger.error(`Failed to process asset ${assetId}: ${message}`);
          throw error;
        }
      },
    );
  }

  private async loadOriginal(
    assetId: string,
    asset: {
      sourceType: MediaSourceType;
      sourceUrl: string | null;
      originalKey: string | null;
      originalMime: string | null;
      originalUrl: string | null;
      visibility: MediaVisibility;
    },
  ): Promise<{
    buffer: Buffer;
    mimeType: string;
    originalKey: string;
    originalUrl: string | null;
  }> {
    if (asset.sourceType === MediaSourceType.IMPORT_URL) {
      const { buffer, mimeType, originalKey, originalUrl } =
        await this.fetchAndStoreOriginal(assetId, asset.sourceUrl);
      await this.prisma.mediaAsset.update({
        where: { id: assetId },
        data: {
          originalKey,
          originalUrl,
        },
      });
      await this.prisma.mediaDerivative.upsert({
        where: {
          assetId_type: { assetId, type: MediaDerivativeType.ORIGINAL },
        },
        update: {
          key: originalKey,
          url: originalUrl,
          mimeType,
          sizeBytes: buffer.length,
        },
        create: {
          assetId,
          type: MediaDerivativeType.ORIGINAL,
          key: originalKey,
          url: originalUrl,
          mimeType,
          sizeBytes: buffer.length,
        },
      });
      return { buffer, mimeType, originalKey, originalUrl };
    }

    const isPrivate = asset.visibility === MediaVisibility.PRIVATE;
    // A private asset has no stored URL: only its key.
    if (!asset.originalKey || (!isPrivate && !asset.originalUrl)) {
      throw new Error('Missing original object reference');
    }
    const buffer = isPrivate
      ? await this.s3Service.getPrivateObjectBuffer(asset.originalKey)
      : await this.s3Service.getObjectBuffer(asset.originalKey);
    const mimeType = asset.originalMime ?? 'application/octet-stream';
    return {
      buffer,
      mimeType,
      originalKey: asset.originalKey,
      originalUrl: isPrivate ? null : asset.originalUrl,
    };
  }

  private buildDisplayBuffer(buffer: Buffer): Promise<Buffer> {
    return sharp(buffer, MEDIA_SHARP_OPTIONS)
      .rotate()
      .resize({
        width: MEDIA_DISPLAY_MAX,
        height: MEDIA_DISPLAY_MAX,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({ quality: 85 })
      .toBuffer();
  }

  private async saveDerivative(
    assetId: string,
    type: MediaDerivativeType,
    buffer: Buffer,
    visibility: MediaVisibility,
  ) {
    const key = `media/${assetId}/${type.toLowerCase()}.webp`;
    const upload =
      visibility === MediaVisibility.PRIVATE
        ? {
            ...(await this.s3Service.uploadPrivateObject({
              key,
              buffer,
              contentType: 'image/webp',
            })),
            url: null,
          }
        : await this.s3Service.uploadObject({
            key,
            buffer,
            contentType: 'image/webp',
          });
    const meta = await sharp(buffer).metadata();
    await this.prisma.mediaDerivative.upsert({
      where: { assetId_type: { assetId, type } },
      update: {
        key: upload.key,
        url: upload.url,
        mimeType: 'image/webp',
        sizeBytes: buffer.length,
        width: meta.width ?? null,
        height: meta.height ?? null,
      },
      create: {
        assetId,
        type,
        key: upload.key,
        url: upload.url,
        mimeType: 'image/webp',
        sizeBytes: buffer.length,
        width: meta.width ?? null,
        height: meta.height ?? null,
      },
    });
  }

  private async fetchAndStoreOriginal(
    assetId: string,
    sourceUrl: string | null,
  ) {
    if (!sourceUrl) {
      throw new Error('Missing source URL');
    }

    const { buffer, contentType } =
      await this.safeRemoteFetcher.fetch(sourceUrl);

    // Header hint only — processor re-identifies before READY.
    const mimeHint =
      contentType && MEDIA_SUPPORTED_MIME_TYPES.has(contentType)
        ? contentType
        : 'application/octet-stream';
    const extension =
      mimeHint === 'image/jpeg'
        ? 'jpg'
        : mimeHint === 'image/png'
          ? 'png'
          : mimeHint === 'image/webp'
            ? 'webp'
            : 'bin';
    const originalKey = `media/${assetId}/original.${extension}`;
    const originalUpload = await this.s3Service.uploadObject({
      key: originalKey,
      buffer,
      contentType: mimeHint,
    });

    return {
      buffer,
      mimeType: mimeHint,
      originalKey: originalUpload.key,
      originalUrl: originalUpload.url,
    };
  }
}
