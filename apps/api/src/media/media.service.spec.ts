import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { BadRequestException } from '@nestjs/common';
import { MediaService } from './media.service';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { MEDIA_QUEUE } from './media.constants';
import {
  MediaAssetStatus,
  MediaDerivativeType,
  MediaSourceType,
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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MediaService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: S3Service, useValue: mockS3 },
        { provide: getQueueToken(MEDIA_QUEUE), useValue: mockQueue },
      ],
    }).compile();

    service = module.get(MediaService);
    prisma = module.get(PrismaService);
    s3Service = module.get(S3Service);
    queue = module.get(getQueueToken(MEDIA_QUEUE));
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
});
