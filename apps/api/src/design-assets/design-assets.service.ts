import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { S3Service } from '../storage/s3.service';
import { MEDIA_SUPPORTED_MIME_TYPES } from '../media/media.constants';
import type { Readable } from 'node:stream';
import {
  MediaAssetStatus,
  MediaDerivativeType,
  MediaVisibility,
  ModerationStatus,
  UserRole,
  VirusScanStatus,
} from '../generated/prisma/enums';

type UploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
};

/** Variants a customer upload can be read in. */
export const DESIGN_ASSET_VARIANTS = ['original', 'display', 'thumb'] as const;
export type DesignAssetVariant = (typeof DESIGN_ASSET_VARIANTS)[number];

const VARIANT_TO_DERIVATIVE: Record<
  Exclude<DesignAssetVariant, 'original'>,
  MediaDerivativeType
> = {
  display: MediaDerivativeType.DISPLAY,
  thumb: MediaDerivativeType.THUMB,
};

@Injectable()
export class DesignAssetsService {
  constructor(
    private prisma: PrismaService,
    private mediaService: MediaService,
    private s3: S3Service,
  ) {}

  /**
   * Upload a user image for use in the Design Workshop canvas.
   * Wraps MediaService to create a PRIVATE MediaAsset + queue processing,
   * then creates a DesignAsset row linking the asset to the owner.
   * Returns `{ designAssetId, status }`. No storage URL is returned: the client reads
   * the image through `GET /design-assets/:id/file` (TTW-099).
   */
  async upload(
    userId: string,
    file: UploadFile,
  ): Promise<{ designAssetId: string; status: string }> {
    const mediaAsset = await this.mediaService.createAssetFromUpload(file, {
      visibility: MediaVisibility.PRIVATE,
    });

    const designAsset = await this.prisma.designAsset.create({
      data: {
        ownerUserId: userId,
        mediaAssetId: mediaAsset.id,
      },
    });

    return {
      designAssetId: designAsset.id,
      status: mediaAsset.status.toLowerCase(),
    };
  }

  /**
   * Short-lived signed link to a private customer file. Same access rules as
   * {@link openFile}. The link is returned to the caller and never stored or logged.
   */
  async createReadLink(
    actor: { id: string; role: UserRole },
    designAssetId: string,
    variant: DesignAssetVariant,
  ): Promise<string> {
    const { key } = await this.authorizeRead(actor, designAssetId, variant);
    return this.s3.createPrivateReadUrl(key);
  }

  /**
   * Bytes of a private customer file, for the workshop canvas and the admin review
   * (an authenticated request, so the browser needs no storage link and no storage CORS).
   */
  async openFile(
    actor: { id: string; role: UserRole },
    designAssetId: string,
    variant: DesignAssetVariant,
  ): Promise<{
    stream: Readable;
    contentLength?: number;
    contentType: string;
  }> {
    const { key, mimeType } = await this.authorizeRead(
      actor,
      designAssetId,
      variant,
    );
    const { stream, contentLength } = await this.s3.getPrivateObjectStream(key);
    // Only an image type we accepted at upload is ever announced, so a browser never
    // gets a chance to run a stored file as a page.
    const contentType = MEDIA_SUPPORTED_MIME_TYPES.has(mimeType ?? '')
      ? (mimeType as string)
      : 'application/octet-stream';
    return { stream, contentLength, contentType };
  }

  /**
   * Only the owner and admins may read a file, and anyone else gets the same 404 as for
   * an unknown id. An owner cannot read a file that failed scanning or processing, or
   * that moderation rejected; an admin can, to review it.
   */
  private async authorizeRead(
    actor: { id: string; role: UserRole },
    designAssetId: string,
    variant: DesignAssetVariant,
  ): Promise<{ key: string; mimeType: string | null }> {
    const designAsset = await this.prisma.designAsset.findUnique({
      where: { id: designAssetId },
      select: {
        ownerUserId: true,
        mediaAsset: {
          select: {
            status: true,
            scanStatus: true,
            moderationStatus: true,
            visibility: true,
            originalKey: true,
            originalMime: true,
            derivatives: { select: { type: true, key: true, mimeType: true } },
          },
        },
      },
    });

    const isAdmin = actor.role === UserRole.ADMIN;
    if (!designAsset || (!isAdmin && designAsset.ownerUserId !== actor.id)) {
      throw new NotFoundException('File not found');
    }

    const media = designAsset.mediaAsset;
    // Legacy public assets are not in the private bucket: never read them from there.
    if (media.visibility !== MediaVisibility.PRIVATE) {
      throw new NotFoundException('File not found');
    }
    if (
      !isAdmin &&
      (media.status === MediaAssetStatus.FAILED ||
        media.scanStatus === VirusScanStatus.INFECTED ||
        media.scanStatus === VirusScanStatus.FAILED ||
        media.moderationStatus === ModerationStatus.REJECTED)
    ) {
      throw new NotFoundException('File not found');
    }

    if (variant === 'original') {
      if (!media.originalKey) throw new NotFoundException('File not found');
      return { key: media.originalKey, mimeType: media.originalMime ?? null };
    }
    const derivative = media.derivatives.find(
      (d) => d.type === VARIANT_TO_DERIVATIVE[variant],
    );
    if (!derivative) {
      throw new NotFoundException('File not found');
    }
    return { key: derivative.key, mimeType: derivative.mimeType ?? null };
  }
}
