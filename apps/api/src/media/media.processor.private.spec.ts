import { MediaProcessor } from './media.processor';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { VirusScanService } from './virus-scan.service';
import { ModerationService } from '../moderation/moderation.service';
import { ModerationDecisionService } from '../moderation/moderation-decision.service';
import { ObservabilityService } from '../observability/observability.service';
import { SafeRemoteMediaFetcher } from './safe-remote-fetch';
import {
  MediaAssetStatus,
  MediaDerivativeType,
  MediaSourceType,
  MediaVisibility,
  ModerationStatus,
  VirusScanStatus,
} from '../generated/prisma/enums';

jest.mock('sharp', () => {
  return () => ({
    metadata: () =>
      Promise.resolve({ format: 'png', width: 1200, height: 900 }),
    rotate: () => ({
      resize: () => ({
        webp: () => ({
          toBuffer: () => Promise.resolve(Buffer.from('webp')),
        }),
      }),
    }),
  });
});

const PRIVATE_ASSET = {
  id: 'asset-p1',
  sourceType: MediaSourceType.UPLOAD,
  sourceUrl: null,
  visibility: MediaVisibility.PRIVATE,
  originalKey: 'media/asset-p1/original.png',
  originalUrl: null,
  originalMime: 'image/png',
  status: MediaAssetStatus.PENDING,
};

describe('MediaProcessor, private customer uploads (TTW-099)', () => {
  let processor: MediaProcessor;
  let prisma: jest.Mocked<PrismaService>;
  let s3Service: {
    getObjectBuffer: jest.Mock;
    getPrivateObjectBuffer: jest.Mock;
    uploadObject: jest.Mock;
    uploadPrivateObject: jest.Mock;
  };
  let virusScanService: { scanBuffer: jest.Mock };
  let moderationService: {
    moderateImage: jest.Mock;
    moderateImageBytes: jest.Mock;
  };

  beforeEach(() => {
    prisma = {
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn(prisma),
      ),
      mediaAsset: { findUnique: jest.fn(), update: jest.fn() },
      mediaDerivative: { upsert: jest.fn() },
    } as unknown as jest.Mocked<PrismaService>;
    s3Service = {
      getObjectBuffer: jest.fn(),
      getPrivateObjectBuffer: jest.fn().mockResolvedValue(Buffer.from('raw')),
      uploadObject: jest.fn(),
      uploadPrivateObject: jest
        .fn()
        .mockImplementation(({ key }: { key: string }) =>
          Promise.resolve({ key }),
        ),
    };
    virusScanService = {
      scanBuffer: jest.fn().mockResolvedValue(VirusScanStatus.CLEAN),
    };
    moderationService = {
      moderateImage: jest.fn(),
      moderateImageBytes: jest.fn().mockResolvedValue({
        status: ModerationStatus.APPROVED,
        notes: 'No categories above threshold',
        maxScore: 0.01,
      }),
    };
    const decisions = {
      recordAiDecisionInTx: jest.fn().mockResolvedValue({ id: 'dec-1' }),
    };

    (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue(
      PRIVATE_ASSET,
    );

    processor = new MediaProcessor(
      prisma,
      s3Service as unknown as S3Service,
      virusScanService as unknown as VirusScanService,
      moderationService as unknown as ModerationService,
      decisions as unknown as ModerationDecisionService,
      { recordQueueJob: jest.fn() } as unknown as ObservabilityService,
      { fetch: jest.fn() } as unknown as SafeRemoteMediaFetcher,
    );
  });

  it('reads the original from private storage and never from the public bucket', async () => {
    await processor.process({ data: { assetId: 'asset-p1' } } as never);

    expect(s3Service.getPrivateObjectBuffer).toHaveBeenCalledWith(
      'media/asset-p1/original.png',
    );
    expect(s3Service.getObjectBuffer).not.toHaveBeenCalled();
  });

  it('gives the AI the image bytes and never a link', async () => {
    await processor.process({ data: { assetId: 'asset-p1' } } as never);

    expect(moderationService.moderateImageBytes).toHaveBeenCalledWith(
      expect.any(Buffer),
      'image/webp',
    );
    expect(moderationService.moderateImage).not.toHaveBeenCalled();
  });

  it('writes the derivatives to private storage and stores no URL', async () => {
    await processor.process({ data: { assetId: 'asset-p1' } } as never);

    expect(s3Service.uploadObject).not.toHaveBeenCalled();
    const keys = s3Service.uploadPrivateObject.mock.calls.map(
      (c) => (c[0] as { key: string }).key,
    );
    expect(keys).toEqual([
      'media/asset-p1/display.webp',
      'media/asset-p1/thumb.webp',
    ]);
    for (const call of (prisma.mediaDerivative.upsert as jest.Mock).mock
      .calls) {
      const { create, update } = call[0] as {
        create: { url?: string | null };
        update: { url?: string | null };
      };
      expect(create.url ?? null).toBeNull();
      expect(update.url ?? null).toBeNull();
    }
    expect(
      (prisma.mediaDerivative.upsert as jest.Mock).mock.calls.map(
        (c) => (c[0] as { create: { type: string } }).create.type,
      ),
    ).toEqual([
      MediaDerivativeType.ORIGINAL,
      MediaDerivativeType.DISPLAY,
      MediaDerivativeType.THUMB,
    ]);
  });

  it('fails closed on a private asset with no stored key', async () => {
    (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue({
      ...PRIVATE_ASSET,
      originalKey: null,
    });

    await expect(
      processor.process({ data: { assetId: 'asset-p1' } } as never),
    ).rejects.toThrow('Missing original object reference');

    expect(moderationService.moderateImageBytes).not.toHaveBeenCalled();
  });

  it('keeps an infected private file unusable and does not moderate or derive it', async () => {
    virusScanService.scanBuffer.mockResolvedValue(VirusScanStatus.INFECTED);

    await processor.process({ data: { assetId: 'asset-p1' } } as never);

    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-p1' },
      data: expect.objectContaining({
        status: MediaAssetStatus.FAILED,
        scanStatus: VirusScanStatus.INFECTED,
      }),
    });
    expect(moderationService.moderateImageBytes).not.toHaveBeenCalled();
    expect(s3Service.uploadPrivateObject).not.toHaveBeenCalled();
  });

  it('keeps the file unusable when the scanner is unavailable (fail closed)', async () => {
    virusScanService.scanBuffer.mockResolvedValue(VirusScanStatus.FAILED);

    await processor.process({ data: { assetId: 'asset-p1' } } as never);

    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-p1' },
      data: expect.objectContaining({ status: MediaAssetStatus.FAILED }),
    });
    expect(moderationService.moderateImageBytes).not.toHaveBeenCalled();
  });
});
