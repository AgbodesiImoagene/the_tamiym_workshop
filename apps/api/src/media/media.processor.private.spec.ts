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
    deletePrivateObject: jest.Mock;
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
      deletePrivateObject: jest.fn().mockResolvedValue(undefined),
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

  describe('cleanup of an infected private file (TTW-099)', () => {
    beforeEach(() => {
      s3Service.deletePrivateObject = jest.fn().mockResolvedValue(undefined);
      (
        prisma.mediaDerivative as unknown as { deleteMany: jest.Mock }
      ).deleteMany = jest.fn().mockResolvedValue({ count: 1 });
      virusScanService.scanBuffer.mockResolvedValue(VirusScanStatus.INFECTED);
    });

    it('deletes the stored object and forgets its key', async () => {
      await processor.process({ data: { assetId: 'asset-p1' } } as never);

      expect(s3Service.deletePrivateObject).toHaveBeenCalledWith(
        'media/asset-p1/original.png',
      );
      expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
        where: { id: 'asset-p1' },
        data: expect.objectContaining({
          status: MediaAssetStatus.FAILED,
          scanStatus: VirusScanStatus.INFECTED,
          originalKey: null,
        }),
      });
      expect(
        (prisma.mediaDerivative as unknown as { deleteMany: jest.Mock })
          .deleteMany,
      ).toHaveBeenCalledWith({ where: { assetId: 'asset-p1' } });
    });

    it('still marks the asset infected and keeps its key when the deletion fails, so the object can be purged later', async () => {
      s3Service.deletePrivateObject.mockRejectedValue(
        new Error('storage down'),
      );

      await processor.process({ data: { assetId: 'asset-p1' } } as never);

      const data = (prisma.mediaAsset.update as jest.Mock).mock.calls
        .map((c) => c[0].data)
        .find((d) => d.scanStatus === VirusScanStatus.INFECTED);
      expect(data.status).toBe(MediaAssetStatus.FAILED);
      expect(data.originalKey).toBeUndefined();
    });

    it('keeps the object when the scanner is merely unavailable, since the scan can be retried', async () => {
      virusScanService.scanBuffer.mockResolvedValue(VirusScanStatus.FAILED);

      await processor.process({ data: { assetId: 'asset-p1' } } as never);

      expect(s3Service.deletePrivateObject).not.toHaveBeenCalled();
    });

    it('does not delete a file that moderation rejected, which may still be appealed', async () => {
      virusScanService.scanBuffer.mockResolvedValue(VirusScanStatus.CLEAN);
      moderationService.moderateImageBytes.mockResolvedValue({
        status: ModerationStatus.REJECTED,
        notes: 'Categories above threshold: harassment: 0.900',
        maxScore: 0.9,
      });

      await processor.process({ data: { assetId: 'asset-p1' } } as never);

      expect(s3Service.deletePrivateObject).not.toHaveBeenCalled();
    });
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
