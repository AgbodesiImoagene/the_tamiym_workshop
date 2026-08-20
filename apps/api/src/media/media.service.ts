import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import type { MediaAsset } from '../generated/prisma/client';
import {
  MediaAssetStatus,
  MediaDerivativeType,
  MediaSourceType,
  ModerationStatus,
  VirusScanStatus,
} from '../generated/prisma/enums';
import {
  MEDIA_MAX_BYTES,
  MEDIA_QUEUE,
  MEDIA_SUPPORTED_MIME_TYPES,
} from './media.constants';

type UploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
};

@Injectable()
export class MediaService {
  constructor(
    private prisma: PrismaService,
    private s3Service: S3Service,
    @InjectQueue(MEDIA_QUEUE) private mediaQueue: Queue,
  ) {}

  // ─── Admin methods ────────────────────────────────────────────────────────────

  /**
   * List media assets for admin review, optionally filtered by moderation status.
   * Includes context from linked design assets (uploader + design) or product images (product).
   */
  async adminFindAll(status?: ModerationStatus) {
    const where = status ? { moderationStatus: status } : {};
    return this.prisma.mediaAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        moderationStatus: true,
        moderationNotes: true,
        originalMime: true,
        originalBytes: true,
        originalWidth: true,
        originalHeight: true,
        createdAt: true,
        updatedAt: true,
        derivatives: {
          select: { type: true, url: true },
        },
        designAssets: {
          take: 1,
          select: {
            owner: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        productImages: {
          take: 1,
          select: {
            product: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
  }

  /** Get a single media asset with full context for admin review. */
  async adminFindOne(id: string) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
      include: {
        derivatives: {
          select: {
            type: true,
            url: true,
            width: true,
            height: true,
            sizeBytes: true,
          },
        },
        designAssets: {
          select: {
            id: true,
            owner: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        },
        productImages: {
          select: {
            id: true,
            altText: true,
            product: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
    if (!asset) {
      throw new NotFoundException('Media asset not found');
    }
    return asset;
  }

  /**
   * Admin override of an asset's moderation status. Accepts APPROVED, FLAGGED, or REJECTED.
   * Does not reprocess the asset — only updates the moderation fields.
   */
  async adminUpdateModeration(
    id: string,
    status: ModerationStatus,
    notes?: string,
  ) {
    const asset = await this.prisma.mediaAsset.findUnique({ where: { id } });
    if (!asset) {
      throw new NotFoundException('Media asset not found');
    }
    if (
      status !== ModerationStatus.APPROVED &&
      status !== ModerationStatus.REJECTED &&
      status !== ModerationStatus.FLAGGED
    ) {
      throw new BadRequestException(
        'status must be APPROVED, REJECTED, or FLAGGED',
      );
    }
    return this.prisma.mediaAsset.update({
      where: { id },
      data: {
        moderationStatus: status,
        ...(notes !== undefined && { moderationNotes: notes }),
      },
    });
  }

  // ─── Asset creation ───────────────────────────────────────────────────────────

  async createAssetFromUrl(sourceUrl: string): Promise<MediaAsset> {
    const normalizedUrl = this.normalizeSourceUrl(sourceUrl);
    const asset = await this.prisma.mediaAsset.create({
      data: {
        sourceType: MediaSourceType.IMPORT_URL,
        sourceUrl: normalizedUrl,
        status: MediaAssetStatus.PENDING,
        scanStatus: VirusScanStatus.PENDING,
        moderationStatus: ModerationStatus.PENDING,
      },
    });
    await this.enqueueProcessing(asset.id);
    return asset;
  }

  async createAssetFromUpload(file: UploadFile): Promise<MediaAsset> {
    if (!MEDIA_SUPPORTED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Unsupported file type');
    }
    if (file.buffer.length > MEDIA_MAX_BYTES) {
      throw new BadRequestException('File is too large');
    }

    const asset = await this.prisma.mediaAsset.create({
      data: {
        sourceType: MediaSourceType.UPLOAD,
        status: MediaAssetStatus.PENDING,
        scanStatus: VirusScanStatus.PENDING,
        moderationStatus: ModerationStatus.PENDING,
      },
    });

    const extension = this.getExtension(file.mimetype, file.originalname);
    const originalKey = `media/${asset.id}/original.${extension}`;
    const originalUpload = await this.s3Service.uploadObject({
      key: originalKey,
      buffer: file.buffer,
      contentType: file.mimetype,
    });

    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        originalKey: originalUpload.key,
        originalUrl: originalUpload.url,
        originalMime: file.mimetype,
        originalBytes: file.buffer.length,
      },
    });

    await this.prisma.mediaDerivative.create({
      data: {
        assetId: asset.id,
        type: MediaDerivativeType.ORIGINAL,
        key: originalUpload.key,
        url: originalUpload.url,
        mimeType: file.mimetype,
        sizeBytes: file.buffer.length,
      },
    });

    await this.enqueueProcessing(asset.id);
    return asset;
  }

  private async enqueueProcessing(assetId: string) {
    await this.mediaQueue.add(
      'process',
      { assetId },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 1000 },
      },
    );
  }

  private normalizeSourceUrl(value: string): string {
    let parsed: URL;
    try {
      parsed = new URL(value);
    } catch {
      throw new BadRequestException('Invalid source URL');
    }
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new BadRequestException('Unsupported URL protocol');
    }

    // SSRF guard: reject private/loopback/link-local hostnames
    const host = parsed.hostname.toLowerCase();
    const ssrfPatterns = [
      /^localhost$/,
      /^127\.\d+\.\d+\.\d+$/,
      /^0\.0\.0\.0$/,
      /^::1$/,
      /^10\.\d+\.\d+\.\d+$/,
      /^172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+$/,
      /^192\.168\.\d+\.\d+$/,
      /^169\.254\.\d+\.\d+$/, // link-local
      /^fd[0-9a-f]{2}:/i, // IPv6 ULA
      /^fe80:/i, // IPv6 link-local
      /^metadata\.google\.internal$/,
      /^169\.254\.169\.254$/, // AWS/GCP IMDS
    ];
    if (ssrfPatterns.some((re) => re.test(host))) {
      throw new BadRequestException('URL points to a disallowed host');
    }

    return parsed.toString();
  }

  private getExtension(mimeType: string, filename?: string): string {
    if (mimeType === 'image/jpeg') {
      return 'jpg';
    }
    if (mimeType === 'image/png') {
      return 'png';
    }
    if (mimeType === 'image/webp') {
      return 'webp';
    }
    if (filename && filename.includes('.')) {
      return filename.split('.').pop() ?? 'bin';
    }
    return 'bin';
  }
}
