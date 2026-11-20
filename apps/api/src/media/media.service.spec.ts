import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { ModerationDecisionService } from '../moderation/moderation-decision.service';
import { MEDIA_QUEUE } from './media.constants';
import {
  MediaAssetStatus,
  MediaDerivativeType,
  MediaSourceType,
  MediaVisibility,
  ModerationStatus,
  VirusScanStatus,
} from '../generated/prisma/enums';

describe('MediaService', () => {
  let service: MediaService;
  let prisma: jest.Mocked<PrismaService>;
  let s3Service: jest.Mocked<S3Service>;
  let queue: { add: jest.Mock };

  beforeEach(async () => {
    const mockPrisma = {
      mediaAsset: {
        create: jest.fn(),
        update: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
      },
      mediaDerivative: {
        create: jest.fn(),
      },
    } as unknown as jest.Mocked<PrismaService>;
    const mockS3 = {
      uploadObject: jest.fn(),
    } as unknown as jest.Mocked<S3Service>;
    const mockQueue = {
      add: jest.fn(),
    };
    const mockDecisions = {
      recordAdminDecision: jest.fn().mockResolvedValue({ id: 'dec-1' }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
        { provide: ModerationDecisionService, useValue: mockDecisions },
        { provide: getQueueToken(MEDIA_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get(MediaService);
    prisma = module.get(PrismaService);
    s3Service = module.get(S3Service);
    queue = module.get(getQueueToken(MEDIA_QUEUE));
  });

  describe('admin review of private uploads (TTW-099)', () => {
    const privateAsset = {
      id: 'media-p',
      visibility: MediaVisibility.PRIVATE,
      designAssets: [{ id: 'da-7', owner: { id: 'u1' } }],
      derivatives: [
        { type: MediaDerivativeType.ORIGINAL, url: null },
        { type: MediaDerivativeType.THUMB, url: null },
      ],
    };

    it('gives admins a stable access path instead of a stored URL (list)', async () => {
      (prisma.mediaAsset as unknown as { findMany: jest.Mock }).findMany = jest
        .fn()
        .mockResolvedValue([privateAsset]);

      const [asset] = await service.adminFindAll();

      expect(asset.derivatives).toEqual([
        {
          type: MediaDerivativeType.ORIGINAL,
          url: null,
          accessPath: '/design-assets/da-7/file?variant=original',
        },
        {
          type: MediaDerivativeType.THUMB,
          url: null,
          accessPath: '/design-assets/da-7/file?variant=thumb',
        },
      ]);
    });

    it('gives admins a stable access path (detail)', async () => {
      (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue({
        ...privateAsset,
        derivatives: [{ type: MediaDerivativeType.DISPLAY, url: null }],
      });

      const asset = await service.adminFindOne('media-p');

      expect(asset.derivatives[0]).toEqual({
        type: MediaDerivativeType.DISPLAY,
        url: null,
        accessPath: '/design-assets/da-7/file?variant=display',
      });
    });

    it('leaves catalogue assets exactly as they were', async () => {
      const publicAsset = {
        id: 'media-c',
        visibility: MediaVisibility.PUBLIC,
        designAssets: [],
        derivatives: [
          {
            type: MediaDerivativeType.DISPLAY,
            url: 'https://cdn.example.com/d.webp',
          },
        ],
      };
      (prisma.mediaAsset as unknown as { findMany: jest.Mock }).findMany = jest
        .fn()
        .mockResolvedValue([publicAsset]);

      const [asset] = await service.adminFindAll();

      expect(asset.derivatives).toEqual(publicAsset.derivatives);
    });
  });

  describe('private customer uploads (TTW-099)', () => {
    const png = {
      buffer: Buffer.from('png-bytes'),
      mimetype: 'image/png',
      originalname: 'logo.png',
    };

    it('stores a private upload in private storage and keeps no URL in the database', async () => {
      (prisma.mediaAsset.create as jest.Mock).mockResolvedValue({
        id: 'asset-9',
      });
      (
        s3Service as unknown as { uploadPrivateObject: jest.Mock }
      ).uploadPrivateObject = jest
        .fn()
        .mockResolvedValue({ key: 'media/asset-9/original.png' });

      await service.createAssetFromUpload(png, {
        visibility: MediaVisibility.PRIVATE,
      });

      expect(prisma.mediaAsset.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          visibility: MediaVisibility.PRIVATE,
        }),
      });
      expect(s3Service.uploadObject).not.toHaveBeenCalled();
      const updateData = (prisma.mediaAsset.update as jest.Mock).mock
        .calls[0][0].data;
      expect(updateData.originalKey).toBe('media/asset-9/original.png');
      expect(updateData.originalUrl).toBeUndefined();
      const derivative = (prisma.mediaDerivative.create as jest.Mock).mock
        .calls[0][0].data;
      expect(derivative.url).toBeNull();
      expect(queue.add).toHaveBeenCalledWith(
        'process',
        { assetId: 'asset-9' },
        expect.any(Object),
      );
    });

    it('does not enqueue processing and creates no URL when private storage fails', async () => {
      (prisma.mediaAsset.create as jest.Mock).mockResolvedValue({
        id: 'asset-9',
      });
      (
        s3Service as unknown as { uploadPrivateObject: jest.Mock }
      ).uploadPrivateObject = jest
        .fn()
        .mockRejectedValue(new Error('storage down'));

      await expect(
        service.createAssetFromUpload(png, {
          visibility: MediaVisibility.PRIVATE,
        }),
      ).rejects.toThrow('storage down');

      expect(s3Service.uploadObject).not.toHaveBeenCalled();
      expect(queue.add).not.toHaveBeenCalled();
    });

    it('keeps catalogue uploads public by default', async () => {
      (prisma.mediaAsset.create as jest.Mock).mockResolvedValue({
        id: 'asset-10',
      });
      (s3Service.uploadObject as jest.Mock).mockResolvedValue({
        key: 'media/asset-10/original.png',
        url: 'https://cdn.example.com/media/asset-10/original.png',
      });

      await service.createAssetFromUpload(png);

      // No visibility passed: the database default (PUBLIC) applies.
      expect(prisma.mediaAsset.create).toHaveBeenCalledWith({
        data: expect.not.objectContaining({
          visibility: MediaVisibility.PRIVATE,
        }),
      });
      expect(s3Service.uploadObject).toHaveBeenCalled();
    });
  });

  it('should enqueue an import URL asset', async () => {
    (prisma.mediaAsset.create as jest.Mock).mockResolvedValue({
      id: 'asset-1',
    });

    const result = await service.createAssetFromUrl(
      'https://example.com/image.png',
    );

    expect(prisma.mediaAsset.create).toHaveBeenCalledWith({
      data: {
        sourceType: MediaSourceType.IMPORT_URL,
        sourceUrl: 'https://example.com/image.png',
        status: MediaAssetStatus.PENDING,
        scanStatus: VirusScanStatus.PENDING,
        moderationStatus: ModerationStatus.PENDING,
      },
    });
    expect(queue.add).toHaveBeenCalledWith(
      'process',
      { assetId: 'asset-1' },
      expect.any(Object),
    );
    expect(result.id).toBe('asset-1');
  });

  it('should reject invalid source URLs', async () => {
    await expect(
      service.createAssetFromUrl('ftp://example.com'),
    ).rejects.toThrow(BadRequestException);
  });

  it('should reject URLs with userinfo', async () => {
    await expect(
      service.createAssetFromUrl('https://user:pass@example.com/a.png'),
    ).rejects.toThrow(/userinfo/);
  });

  it('should reject blocked hosts at create time', async () => {
    await expect(
      service.createAssetFromUrl('https://127.0.0.1/a.png'),
    ).rejects.toThrow(/disallowed host/);
  });

  it('should upload originals and enqueue upload assets', async () => {
    (prisma.mediaAsset.create as jest.Mock).mockResolvedValue({
      id: 'asset-2',
    });
    (s3Service.uploadObject as jest.Mock).mockResolvedValue({
      key: 'media/asset-2/original.png',
      url: 'https://cdn.example.com/media/asset-2/original.png',
    });

    await service.createAssetFromUpload({
      buffer: Buffer.from('raw'),
      mimetype: 'image/png',
      originalname: 'file.png',
    });

    expect(s3Service.uploadObject).toHaveBeenCalledWith({
      key: 'media/asset-2/original.png',
      buffer: expect.any(Buffer),
      contentType: 'image/png',
    });
    expect(prisma.mediaAsset.update).toHaveBeenCalledWith({
      where: { id: 'asset-2' },
      data: {
        originalKey: 'media/asset-2/original.png',
        originalUrl: 'https://cdn.example.com/media/asset-2/original.png',
        originalMime: 'image/png',
        originalBytes: 3,
      },
    });
    expect(prisma.mediaDerivative.create).toHaveBeenCalledWith({
      data: {
        assetId: 'asset-2',
        type: MediaDerivativeType.ORIGINAL,
        key: 'media/asset-2/original.png',
        url: 'https://cdn.example.com/media/asset-2/original.png',
        mimeType: 'image/png',
        sizeBytes: 3,
      },
    });
    expect(queue.add).toHaveBeenCalledWith(
      'process',
      { assetId: 'asset-2' },
      expect.any(Object),
    );
  });

  it('adminUpdateModeration records an ADMIN decision', async () => {
    const decisions = {
      recordAdminDecision: jest.fn().mockResolvedValue({ id: 'dec-9' }),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: prisma },
        { provide: S3Service, useValue: s3Service },
        { provide: ModerationDecisionService, useValue: decisions },
        { provide: getQueueToken(MEDIA_QUEUE), useValue: queue },
      ],
    }).compile();
    const media = module.get(MediaService);

    (prisma.mediaAsset.findUnique as jest.Mock).mockResolvedValue({
      id: 'asset-1',
      checksum: 'abc',
      originalKey: 'k',
    });
    (prisma.mediaAsset.findUniqueOrThrow as jest.Mock).mockResolvedValue({
      id: 'asset-1',
      moderationStatus: ModerationStatus.APPROVED,
    });

    await media.adminUpdateModeration(
      'asset-1',
      ModerationStatus.APPROVED,
      'looks fine',
      'admin-1',
    );

    expect(decisions.recordAdminDecision).toHaveBeenCalledWith(
      expect.objectContaining({
        subjectType: 'MEDIA',
        subjectId: 'asset-1',
        outcome: ModerationStatus.APPROVED,
        actorUserId: 'admin-1',
        notes: 'looks fine',
      }),
    );
  });
});
