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
  ModerationStatus,
  VirusScanStatus,
} from '../generated/prisma/enums';
import { ModerationService } from '../moderation/moderation.service';
import { VirusScanService } from './virus-scan.service';
import { ObservabilityService } from '../observability/observability.service';
import { runWithRequestContext } from '../request-context/request-context.store';
import {
  MEDIA_DISPLAY_MAX,
  MEDIA_MAX_BYTES,
  MEDIA_QUEUE,
  MEDIA_SUPPORTED_MIME_TYPES,
  MEDIA_THUMB_MAX,
} from './media.constants';

@Processor(MEDIA_QUEUE)
export class MediaProcessor extends WorkerHost {
  private readonly logger = new Logger(MediaProcessor.name);

  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
    private virusScanService: VirusScanService,
    private moderationService: ModerationService,
    private observability: ObservabilityService,
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
          const { buffer, mimeType, originalKey, originalUrl } =
            await this.loadOriginal(assetId, asset);
          if (!MEDIA_SUPPORTED_MIME_TYPES.has(mimeType)) {
            throw new Error('Unsupported media type');
          }
          if (buffer.length > MEDIA_MAX_BYTES) {
            throw new Error('File is too large');
          }

          const scanStatus = await this.virusScanService.scanBuffer();
          if (scanStatus !== VirusScanStatus.CLEAN) {
            await this.prisma.mediaAsset.update({
              where: { id: assetId },
              data: {
                scanStatus,
                status: MediaAssetStatus.FAILED,
                errorMessage: 'Virus scan failed',
              },
            });
            return;
          }

          // AI moderation: use the public URL if available, otherwise skip image check.
          // REJECTED → fail the asset (blocks use); FLAGGED → mark for human review but
          // keep the asset READY so the user's upload is not silently lost.
          const assetForMod = await this.prisma.mediaAsset.findUnique({
            where: { id: assetId },
            select: { originalUrl: true },
          });
          const moderationResult = assetForMod?.originalUrl
            ? await this.moderationService.moderateImage(
                assetForMod.originalUrl,
              )
            : {
                status: ModerationStatus.PENDING,
                notes: 'No URL available for moderation',
                maxScore: 0,
              };

          if (moderationResult.status === ModerationStatus.REJECTED) {
            await this.prisma.mediaAsset.update({
              where: { id: assetId },
              data: {
                moderationStatus: ModerationStatus.REJECTED,
                moderationNotes: moderationResult.notes,
                status: MediaAssetStatus.FAILED,
                errorMessage: 'Asset rejected by content moderation',
              },
            });
            this.logger.warn(
              `Asset ${assetId} auto-rejected by AI moderation: ${moderationResult.notes}`,
            );
            return;
          }

          const originalMeta = await sharp(buffer).metadata();
          await this.prisma.mediaAsset.update({
            where: { id: assetId },
            data: {
              originalMime: mimeType,
              originalBytes: buffer.length,
              originalWidth: originalMeta.width ?? null,
              originalHeight: originalMeta.height ?? null,
              scanStatus,
              moderationStatus: moderationResult.status,
              moderationNotes: moderationResult.notes,
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
              width: originalMeta.width ?? null,
              height: originalMeta.height ?? null,
            },
            create: {
              assetId,
              type: MediaDerivativeType.ORIGINAL,
              key: originalKey,
              url: originalUrl,
              mimeType,
              sizeBytes: buffer.length,
              width: originalMeta.width ?? null,
              height: originalMeta.height ?? null,
            },
          });

          const displayBuffer = await sharp(buffer)
            .rotate()
            .resize({
              width: MEDIA_DISPLAY_MAX,
              height: MEDIA_DISPLAY_MAX,
              fit: 'inside',
              withoutEnlargement: true,
            })
            .webp({ quality: 85 })
            .toBuffer();

          const thumbBuffer = await sharp(buffer)
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
          );
          await this.saveDerivative(
            assetId,
            MediaDerivativeType.THUMB,
            thumbBuffer,
          );

          await this.prisma.mediaAsset.update({
            where: { id: assetId },
            data: {
              status: MediaAssetStatus.READY,
              scanStatus,
              moderationStatus: moderationResult.status,
              moderationNotes: moderationResult.notes,
              errorMessage: null,
            },
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
    },
  ) {
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

    if (!asset.originalKey || !asset.originalUrl) {
      throw new Error('Missing original object reference');
    }
    const buffer = await this.s3Service.getObjectBuffer(asset.originalKey);
    const mimeType = asset.originalMime ?? 'application/octet-stream';
    return {
      buffer,
      mimeType,
      originalKey: asset.originalKey,
      originalUrl: asset.originalUrl,
    };
  }

  private async saveDerivative(
    assetId: string,
    type: MediaDerivativeType,
    buffer: Buffer,
  ) {
    const key = `media/${assetId}/${type.toLowerCase()}.webp`;
    const upload = await this.s3Service.uploadObject({
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
    const response = await fetch(sourceUrl);
    if (!response.ok || !response.body) {
      throw new Error('Failed to fetch source URL');
    }
    const contentType =
      response.headers.get('content-type')?.split(';')[0] ?? '';
    if (!MEDIA_SUPPORTED_MIME_TYPES.has(contentType)) {
      throw new Error('Unsupported media type');
    }
    const contentLength = response.headers.get('content-length');
    if (contentLength && Number(contentLength) > MEDIA_MAX_BYTES) {
      throw new Error('File is too large');
    }

    const reader = response.body.getReader();
    const chunks: Buffer[] = [];
    let total = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      total += chunk.length;
      if (total > MEDIA_MAX_BYTES) {
        throw new Error('File is too large');
      }
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    const extension = contentType.split('/')[1] ?? 'bin';
    const originalKey = `media/${assetId}/original.${extension}`;
    const originalUpload = await this.s3Service.uploadObject({
      key: originalKey,
      buffer,
      contentType,
    });

    return {
      buffer,
      mimeType: contentType,
      originalKey: originalUpload.key,
      originalUrl: originalUpload.url,
    };
  }
}
