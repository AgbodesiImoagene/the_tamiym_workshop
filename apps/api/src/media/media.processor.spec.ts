import { MediaProcessor } from './media.processor';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { VirusScanService } from './virus-scan.service';
import { ModerationService } from '../moderation/moderation.service';
import { ObservabilityService } from '../observability/observability.service';
import {
  MediaAssetStatus,
  MediaDerivativeType,
  MediaSourceType,
  ModerationStatus,
  VirusScanStatus,
} from '../generated/prisma/enums';

jest.mock('sharp', () => {
  return () => ({
    metadata: () => Promise.resolve({ width: 1200, height: 900 }),
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

  beforeEach(() => {
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

    processor = new MediaProcessor(
      prisma,
      s3Service,
      virusScanService,
      moderationService,
      observability,
    );
  });

  it('marks asset as FAILED when virus scan is not clean', async () => {
    (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue(UPLOAD_ASSET);
    (s3Service.getObjectBuffer as jest.Mock).mockResolvedValue(
      Buffer.from('raw'),
    );
    (virusScanService.scanBuffer as jest.Mock).mockResolvedValue(
      VirusScanStatus.INFECTED,
    );

    await processor.process({ data: { assetId: 'asset-1' } } as never);

    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-1' },
      data: {
        scanStatus: VirusScanStatus.INFECTED,
        status: MediaAssetStatus.FAILED,
        errorMessage: 'Virus scan failed',
      },
    });
    expect(s3Service.uploadObject).not.toHaveBeenCalled();
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
});
