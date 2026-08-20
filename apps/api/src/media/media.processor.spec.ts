import { MediaProcessor } from './media.processor';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { VirusScanService } from './virus-scan.service';
import { ModerationService } from '../moderation/moderation.service';
import { ObservabilityService } from '../observability/observability.service';
import { SafeRemoteMediaFetcher } from './safe-remote-fetch';
import {
  MediaAssetStatus,
  MediaDerivativeType,
  MediaSourceType,
  ModerationStatus,
  VirusScanStatus,
} from '../generated/prisma/enums';

jest.mock('sharp', () => {
  return () => ({
    metadata: () =>
      Promise.resolve({
        format:
          (global as { __mediaSharpFormat?: string }).__mediaSharpFormat ??
          'png',
        width: 1200,
        height: 900,
      }),
    rotate: () => ({
      resize: () => ({
        webp: () => ({
          toBuffer: () => Promise.resolve(Buffer.from('webp')),
        }),
      }),
    }),
  });
});

const APPROVED_RESULT = {
  status: ModerationStatus.APPROVED,
  notes: 'No categories above threshold',
  maxScore: 0.05,
};

const REJECTED_RESULT = {
  status: ModerationStatus.REJECTED,
  notes: 'Categories above threshold: harassment: 0.900',
  maxScore: 0.9,
};

const FLAGGED_RESULT = {
  status: ModerationStatus.FLAGGED,
  notes: 'Categories above threshold: violence: 0.450',
  maxScore: 0.45,
};

const UPLOAD_ASSET = {
  id: 'asset-1',
  sourceType: MediaSourceType.UPLOAD,
  sourceUrl: null,
  originalKey: 'media/asset-1/original.png',
  originalUrl: 'https://cdn.example.com/media/asset-1/original.png',
  originalMime: 'image/png',
  status: MediaAssetStatus.PENDING,
};

describe('MediaProcessor', () => {
  let processor: MediaProcessor;
  let prisma: jest.Mocked<PrismaService>;
  let s3Service: jest.Mocked<S3Service>;
  let virusScanService: jest.Mocked<VirusScanService>;
  let moderationService: jest.Mocked<ModerationService>;
  let observability: jest.Mocked<ObservabilityService>;
  let safeRemoteFetcher: jest.Mocked<SafeRemoteMediaFetcher>;

  beforeEach(() => {
    (global as { __mediaSharpFormat?: string }).__mediaSharpFormat = 'png';
    prisma = {
      mediaAsset: {
        findUnique: jest.fn(),
        update: jest.fn(),
      },
      mediaDerivative: {
        upsert: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;
    s3Service = {
      getObjectBuffer: jest.fn(),
      uploadObject: jest.fn(),
    } as unknown as jest.Mocked<S3Service>;
    virusScanService = {
      scanBuffer: jest.fn(),
    } as unknown as jest.Mocked<VirusScanService>;
    moderationService = {
      moderate: jest.fn(),
      moderateText: jest.fn(),
      moderateImage: jest.fn(),
    } as unknown as jest.Mocked<ModerationService>;
    observability = {
      recordQueueJob: jest.fn(),
    } as unknown as jest.Mocked<ObservabilityService>;
    safeRemoteFetcher = {
      fetch: jest.fn(),
    } as unknown as jest.Mocked<SafeRemoteMediaFetcher>;

    processor = new MediaProcessor(
      prisma,
      s3Service,
      virusScanService,
      moderationService,
      observability,
      safeRemoteFetcher,
    );
  });

  it('marks asset as FAILED when virus scan is INFECTED and passes buffer', async () => {
    const raw = Buffer.from('raw');
    (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue(UPLOAD_ASSET);
    (s3Service.getObjectBuffer as jest.Mock).mockResolvedValue(raw);
    (virusScanService.scanBuffer as jest.Mock).mockResolvedValue(
      VirusScanStatus.INFECTED,
    );

    await processor.process({ data: { assetId: 'asset-1' } } as never);

    expect(virusScanService.scanBuffer).toHaveBeenCalledWith(raw);
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: {
        scanStatus: VirusScanStatus.INFECTED,
        originalBytes: raw.length,
        status: MediaAssetStatus.FAILED,
        errorMessage: 'Virus scan detected malware',
      },
    });
    expect(s3Service.uploadObject).not.toHaveBeenCalled();
  });

  it('marks asset as FAILED when virus scan status is FAILED', async () => {
    const raw = Buffer.from('raw');
    (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue(UPLOAD_ASSET);
    (s3Service.getObjectBuffer as jest.Mock).mockResolvedValue(raw);
    (virusScanService.scanBuffer as jest.Mock).mockResolvedValue(
      VirusScanStatus.FAILED,
    );

    await processor.process({ data: { assetId: 'asset-1' } } as never);

    expect(virusScanService.scanBuffer).toHaveBeenCalledWith(raw);
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: {
        scanStatus: VirusScanStatus.FAILED,
        originalBytes: raw.length,
        status: MediaAssetStatus.FAILED,
        errorMessage: 'Virus scan failed',
      },
    });
  });

  it('marks asset as FAILED and stores notes when AI moderation auto-rejects', async () => {
    // findUnique called twice: once for main asset load, once for moderation URL check
    (prisma.mediaAsset.findUnique as jest.Mock)
      .mockResolvedValueOnce(UPLOAD_ASSET)
      .mockResolvedValueOnce({ originalUrl: UPLOAD_ASSET.originalUrl });
    (s3Service.getObjectBuffer as jest.Mock).mockResolvedValue(
      Buffer.from('raw'),
    );
    (virusScanService.scanBuffer as jest.Mock).mockResolvedValue(
      VirusScanStatus.CLEAN,
    );
    (moderationService.moderateImage as jest.Mock).mockResolvedValue(
      REJECTED_RESULT,
    );

    await processor.process({ data: { assetId: 'asset-1' } } as never);

    expect(prisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asset-1' },
        data: expect.objectContaining({
          moderationStatus: ModerationStatus.REJECTED,
          moderationNotes: REJECTED_RESULT.notes,
          status: MediaAssetStatus.FAILED,
        }),
      }),
    );
    expect(s3Service.uploadObject).not.toHaveBeenCalled();
  });

  it('creates derivatives and marks READY with APPROVED moderation', async () => {
    (prisma.mediaAsset.findUnique as jest.Mock)
      .mockResolvedValueOnce(UPLOAD_ASSET)
      .mockResolvedValueOnce({ originalUrl: UPLOAD_ASSET.originalUrl });
    (s3Service.getObjectBuffer as jest.Mock).mockResolvedValue(
      Buffer.from('raw'),
    );
    (s3Service.uploadObject as jest.Mock).mockResolvedValue({
      key: 'media/asset-1/display.webp',
      url: 'https://cdn.example.com/media/asset-1/display.webp',
    });
    (virusScanService.scanBuffer as jest.Mock).mockResolvedValue(
      VirusScanStatus.CLEAN,
    );
    (moderationService.moderateImage as jest.Mock).mockResolvedValue(
      APPROVED_RESULT,
    );

    await processor.process({ data: { assetId: 'asset-1' } } as never);

    expect(virusScanService.scanBuffer).toHaveBeenCalledWith(
      Buffer.from('raw'),
    );
    expect(prisma.mediaDerivative.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assetId_type: {
            assetId: 'asset-1',
            type: MediaDerivativeType.ORIGINAL,
          },
        },
      }),
    );
    expect(prisma.mediaDerivative.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assetId_type: {
            assetId: 'asset-1',
            type: MediaDerivativeType.DISPLAY,
          },
        },
      }),
    );
    expect(prisma.mediaDerivative.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          assetId_type: { assetId: 'asset-1', type: MediaDerivativeType.THUMB },
        },
      }),
    );
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asset-1' },
        data: expect.objectContaining({
          status: MediaAssetStatus.READY,
          moderationStatus: ModerationStatus.APPROVED,
        }),
      }),
    );
  });

  it('creates derivatives and marks READY with FLAGGED moderation (human review queue)', async () => {
    (prisma.mediaAsset.findUnique as jest.Mock)
      .mockResolvedValueOnce(UPLOAD_ASSET)
      .mockResolvedValueOnce({ originalUrl: UPLOAD_ASSET.originalUrl });
    (s3Service.getObjectBuffer as jest.Mock).mockResolvedValue(
      Buffer.from('raw'),
    );
    (s3Service.uploadObject as jest.Mock).mockResolvedValue({
      key: 'media/asset-1/display.webp',
      url: 'https://cdn.example.com/media/asset-1/display.webp',
    });
    (virusScanService.scanBuffer as jest.Mock).mockResolvedValue(
      VirusScanStatus.CLEAN,
    );
    (moderationService.moderateImage as jest.Mock).mockResolvedValue(
      FLAGGED_RESULT,
    );

    await processor.process({ data: { assetId: 'asset-1' } } as never);

    // FLAGGED assets are READY (not blocked) but carry the FLAGGED moderation status
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'asset-1' },
        data: expect.objectContaining({
          status: MediaAssetStatus.READY,
          moderationStatus: ModerationStatus.FLAGGED,
          moderationNotes: FLAGGED_RESULT.notes,
        }),
      }),
    );
  });

  it('fails when image identify rejects unsupported format', async () => {
    (global as { __mediaSharpFormat?: string }).__mediaSharpFormat = 'gif';
    (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue(UPLOAD_ASSET);
    (s3Service.getObjectBuffer as jest.Mock).mockResolvedValue(
      Buffer.from('raw'),
    );
    (virusScanService.scanBuffer as jest.Mock).mockResolvedValue(
      VirusScanStatus.CLEAN,
    );

    await expect(
      processor.process({ data: { assetId: 'asset-1' } } as never),
    ).rejects.toThrow(/Unsupported or corrupt image/);

    expect(prisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: MediaAssetStatus.FAILED,
        }),
      }),
    );
  });

  it('imports remote URLs via SafeRemoteMediaFetcher and stores original', async () => {
    const importAsset = {
      ...UPLOAD_ASSET,
      sourceType: MediaSourceType.IMPORT_URL,
      sourceUrl: 'https://cdn.example.com/photo.jpg',
      originalKey: null,
      originalUrl: null,
      originalMime: null,
    };
    (prisma.mediaAsset.findUnique as jest.Mock)
      .mockResolvedValueOnce(importAsset)
      .mockResolvedValueOnce({
        originalUrl: 'https://cdn.example.com/media/asset-1/original.jpg',
      });
    (safeRemoteFetcher.fetch as jest.Mock).mockResolvedValue({
      buffer: Buffer.from('remote'),
      contentType: 'image/jpeg',
    });
    (s3Service.uploadObject as jest.Mock).mockResolvedValue({
      key: 'media/asset-1/original.jpg',
      url: 'https://cdn.example.com/media/asset-1/original.jpg',
    });
    (virusScanService.scanBuffer as jest.Mock).mockResolvedValue(
      VirusScanStatus.CLEAN,
    );
    (moderationService.moderateImage as jest.Mock).mockResolvedValue(
      APPROVED_RESULT,
    );

    await processor.process({ data: { assetId: 'asset-1' } } as never);

    expect(safeRemoteFetcher.fetch).toHaveBeenCalledWith(
      'https://cdn.example.com/photo.jpg',
    );
    expect(s3Service.uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'media/asset-1/original.jpg',
        contentType: 'image/jpeg',
      }),
    );
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: MediaAssetStatus.READY }),
      }),
    );
  });

  it('uses octet-stream key extension when remote content-type is not a supported image', async () => {
    const importAsset = {
      ...UPLOAD_ASSET,
      sourceType: MediaSourceType.IMPORT_URL,
      sourceUrl: 'https://cdn.example.com/blob',
      originalKey: null,
      originalUrl: null,
    };
    (prisma.mediaAsset.findUnique as jest.Mock)
      .mockResolvedValueOnce(importAsset)
      .mockResolvedValueOnce({
        originalUrl: 'https://cdn.example.com/media/asset-1/original.bin',
      });
    (safeRemoteFetcher.fetch as jest.Mock).mockResolvedValue({
      buffer: Buffer.from('remote'),
      contentType: 'application/octet-stream',
    });
    (s3Service.uploadObject as jest.Mock).mockResolvedValue({
      key: 'media/asset-1/original.bin',
      url: 'https://cdn.example.com/media/asset-1/original.bin',
    });
    (virusScanService.scanBuffer as jest.Mock).mockResolvedValue(
      VirusScanStatus.CLEAN,
    );
    (moderationService.moderateImage as jest.Mock).mockResolvedValue(
      APPROVED_RESULT,
    );

    await processor.process({ data: { assetId: 'asset-1' } } as never);

    expect(s3Service.uploadObject).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'media/asset-1/original.bin',
        contentType: 'application/octet-stream',
      }),
    );
  });
});
