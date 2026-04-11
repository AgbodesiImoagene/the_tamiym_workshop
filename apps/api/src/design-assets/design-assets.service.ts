import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';

type UploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname?: string;
};

@Injectable()
export class DesignAssetsService {
  constructor(
    private prisma: PrismaService,
    private mediaService: MediaService,
  ) {}

  /**
   * Upload a user image for use in the Design Workshop canvas.
   * Wraps MediaService to create a MediaAsset + queue processing,
   * then creates a DesignAsset row linking the asset to the owner.
   * Returns `{ designAssetId, originalUrl, status }` — the client can use
   * `originalUrl` immediately while derivatives are generated in the background.
   */
  async upload(
    userId: string,
    file: UploadFile,
  ): Promise<{
    designAssetId: string;
    originalUrl: string | null;
    status: string;
  }> {
    const mediaAsset = await this.mediaService.createAssetFromUpload(file);

    const designAsset = await this.prisma.designAsset.create({
      data: {
        ownerUserId: userId,
        mediaAssetId: mediaAsset.id,
      },
    });

    return {
      designAssetId: designAsset.id,
      originalUrl: mediaAsset.originalUrl,
      status: mediaAsset.status.toLowerCase(),
    };
  }
}
