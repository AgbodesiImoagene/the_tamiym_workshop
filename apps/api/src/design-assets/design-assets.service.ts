import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { S3Service } from '../storage/s3.service';
import { MEDIA_SUPPORTED_MIME_TYPES } from '../media/media.constants';
import { hashDesignShareToken } from '../designs/design-share.crypto';
import {
  isShareLinkOpen,
  isShareTokenShape,
} from '../designs/design-share.policy';
import { collectDesignAssetIds } from './design-data-assets';
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

const READ_SELECT = {
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
} as const;

interface ReadableMedia {
  status: MediaAssetStatus;
  scanStatus: VirusScanStatus;
  moderationStatus: ModerationStatus;
  visibility: MediaVisibility;
  originalKey: string | null;
  originalMime: string | null;
  derivatives: { type: MediaDerivativeType; key: string; mimeType: string }[];
}

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
    return this.streamFile(key, mimeType);
  }

  /**
   * Bytes of a private customer image for the holder of a design share link, no session
   * (TTW-234). Every denial is the same 404, so nothing can be enumerated. The link must be
   * live and its design approved (same rule as the shared design itself), the design must
   * use this asset, and the asset must belong to the design's owner: a share token opens
   * the images of its own design and nothing else. Rejected, infected or failed files stay
   * closed, with no admin exception.
   */
  async openSharedFile(
    shareToken: string,
    designAssetId: string,
    variant: DesignAssetVariant,
  ): Promise<{
    stream: Readable;
    contentLength?: number;
    contentType: string;
  }> {
    if (!isShareTokenShape(shareToken)) {
      throw new NotFoundException('File not found');
    }
    const link = await this.prisma.designShareLink.findUnique({
      where: { tokenHash: hashDesignShareToken(shareToken) },
      select: {
        expiresAt: true,
        revokedAt: true,
        design: {
          select: { userId: true, moderationStatus: true, designData: true },
        },
      },
    });
    if (
      !link ||
      !isShareLinkOpen(link) ||
      !collectDesignAssetIds(link.design.designData).has(designAssetId)
    ) {
      throw new NotFoundException('File not found');
    }

    const designAsset = await this.prisma.designAsset.findUnique({
      where: { id: designAssetId },
      select: READ_SELECT,
    });
    if (!designAsset || designAsset.ownerUserId !== link.design.userId) {
      throw new NotFoundException('File not found');
    }
    const { key, mimeType } = this.resolveReadable(
      designAsset.mediaAsset,
      variant,
      false,
    );
    return this.streamFile(key, mimeType);
  }

  private async streamFile(
    key: string,
    mimeType: string | null,
  ): Promise<{
    stream: Readable;
    contentLength?: number;
    contentType: string;
  }> {
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
      select: READ_SELECT,
    });

    const isAdmin = actor.role === UserRole.ADMIN;
    if (!designAsset || (!isAdmin && designAsset.ownerUserId !== actor.id)) {
      throw new NotFoundException('File not found');
    }
    return this.resolveReadable(designAsset.mediaAsset, variant, isAdmin);
  }

  /**
   * Key and mime type of one rendition. Legacy public assets are never read from the
   * private bucket. Unless `allowUnusable` (admin review), a file that failed scanning or
   * processing, or that moderation rejected, stays closed.
   */
  private resolveReadable(
    media: ReadableMedia,
    variant: DesignAssetVariant,
    allowUnusable: boolean,
  ): { key: string; mimeType: string | null } {
    if (media.visibility !== MediaVisibility.PRIVATE) {
      throw new NotFoundException('File not found');
    }
    if (
      !allowUnusable &&
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
