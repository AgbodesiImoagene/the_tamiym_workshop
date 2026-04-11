import { BadRequestException, Injectable } from '@nestjs/common';
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
