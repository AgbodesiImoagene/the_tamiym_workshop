import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { ModerationDecisionService } from '../moderation/moderation-decision.service';
import type { MediaAsset } from '../generated/prisma/client';
import {
  MediaAssetStatus,
  MediaDerivativeType,
  MediaSourceType,
  MediaVisibility,
  ModerationStatus,
  ModerationSubjectType,
  VirusScanStatus,
} from '../generated/prisma/enums';
import {
  MEDIA_MAX_BYTES,
  MEDIA_QUEUE,
  MEDIA_SUPPORTED_MIME_TYPES,
} from './media.constants';
import { isBlockedHostname } from './safe-remote-fetch';

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
    private moderationDecisions: ModerationDecisionService,
    @InjectQueue(MEDIA_QUEUE) private mediaQueue: Queue,
  ) {}

  // ─── Admin methods ────────────────────────────────────────────────────────────

  /**
   * List media assets for admin review, optionally filtered by moderation status.
   * Includes context from linked design assets (uploader + design) or product images (product).
   */
  async adminFindAll(status?: ModerationStatus) {
    const where = status ? { moderationStatus: status } : {};
    const assets = await this.prisma.mediaAsset.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        visibility: true,
        scanStatus: true,
        errorMessage: true,
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
          take: 1,
          select: {
            product: { select: { id: true, name: true, slug: true } },
          },
        },
      },
    });
    return assets.map((asset) => this.withAccessPaths(asset));
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
    return this.withAccessPaths(asset);
  }

  /**
   * Private assets keep no URL in the database. Give admins the stable API path that
   * redirects to a short-lived signed link instead (TTW-099). Catalogue assets are
   * returned unchanged.
   */
  private withAccessPaths<
    T extends {
      visibility: MediaVisibility;
      designAssets: { id: string }[];
      derivatives: { type: MediaDerivativeType; url: string | null }[];
    },
  >(asset: T) {
    const designAssetId = asset.designAssets[0]?.id;
    if (asset.visibility !== MediaVisibility.PRIVATE || !designAssetId) {
      return asset;
    }
    return {
      ...asset,
      derivatives: asset.derivatives.map((derivative) => ({
        ...derivative,
        accessPath: `/design-assets/${designAssetId}/file?variant=${derivative.type.toLowerCase()}`,
      })),
    };
  }

  /**
   * Admin override of an asset's moderation status. Accepts APPROVED, FLAGGED, or REJECTED.
   * Does not reprocess the asset — only updates the moderation fields.
   */
  async adminUpdateModeration(
    id: string,
    status: ModerationStatus,
    notes?: string,
    actorUserId?: string,
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
    await this.moderationDecisions.recordAdminDecision({
      subjectType: ModerationSubjectType.MEDIA,
      subjectId: id,
      outcome: status,
      actorUserId: actorUserId ?? null,
      notes: notes ?? null,
      revisionHash: asset.checksum ?? asset.originalKey ?? null,
      withdrawPendingAppeals: true,
    });
    return this.prisma.mediaAsset.findUniqueOrThrow({ where: { id } });
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

  /**
   * Store an uploaded image. Catalogue uploads are PUBLIC (the default). A PRIVATE
   * upload (customer artwork, TTW-099) goes to the private bucket and keeps no URL in
   * the database: it is only readable through a short-lived signed link.
   */
  async createAssetFromUpload(
    file: UploadFile,
    options?: { visibility?: MediaVisibility },
  ): Promise<MediaAsset> {
    if (!MEDIA_SUPPORTED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException('Unsupported file type');
    }
    if (file.buffer.length > MEDIA_MAX_BYTES) {
      throw new BadRequestException('File is too large');
    }
    const isPrivate = options?.visibility === MediaVisibility.PRIVATE;

    const asset = await this.prisma.mediaAsset.create({
      data: {
        sourceType: MediaSourceType.UPLOAD,
        status: MediaAssetStatus.PENDING,
        scanStatus: VirusScanStatus.PENDING,
        moderationStatus: ModerationStatus.PENDING,
        ...(isPrivate ? { visibility: MediaVisibility.PRIVATE } : {}),
      },
    });

    const extension = this.getExtension(file.mimetype, file.originalname);
    const originalKey = `media/${asset.id}/original.${extension}`;
    const originalUpload = isPrivate
      ? {
          ...(await this.s3Service.uploadPrivateObject({
            key: originalKey,
            buffer: file.buffer,
            contentType: file.mimetype,
          })),
          url: null,
        }
      : await this.s3Service.uploadObject({
          key: originalKey,
          buffer: file.buffer,
          contentType: file.mimetype,
        });

    await this.prisma.mediaAsset.update({
      where: { id: asset.id },
      data: {
        originalKey: originalUpload.key,
        ...(originalUpload.url ? { originalUrl: originalUpload.url } : {}),
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
    if (parsed.username || parsed.password) {
      throw new BadRequestException('URL must not include userinfo');
    }

    // Cheap SSRF guard: reject private/loopback/link-local/metadata hostnames
    // and IP literals. Full DNS pin + redirect validation happens at fetch time.
    if (isBlockedHostname(parsed.hostname)) {
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
