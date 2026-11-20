import { NotFoundException } from '@nestjs/common';
import { DesignAssetsService } from './design-assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { S3Service } from '../storage/s3.service';
import {
  MediaAssetStatus,
  MediaDerivativeType,
  MediaVisibility,
  ModerationStatus,
  UserRole,
  VirusScanStatus,
} from '../generated/prisma/enums';

const OWNER = { id: 'user-owner', role: UserRole.CUSTOMER };
const STRANGER = { id: 'user-stranger', role: UserRole.CUSTOMER };
const ADMIN = { id: 'user-admin', role: UserRole.ADMIN };

function designAssetRow(
  overrides: Partial<{
    ownerUserId: string;
    status: MediaAssetStatus;
    scanStatus: VirusScanStatus;
    moderationStatus: ModerationStatus;
    visibility: MediaVisibility;
    originalKey: string | null;
    derivatives: { type: MediaDerivativeType; key: string }[];
  }> = {},
) {
  return {
    id: 'da-1',
    ownerUserId: overrides.ownerUserId ?? OWNER.id,
    mediaAsset: {
      status: overrides.status ?? MediaAssetStatus.READY,
      scanStatus: overrides.scanStatus ?? VirusScanStatus.CLEAN,
      moderationStatus: overrides.moderationStatus ?? ModerationStatus.APPROVED,
      visibility: overrides.visibility ?? MediaVisibility.PRIVATE,
      originalKey:
        overrides.originalKey === undefined
          ? 'media/m1/original.png'
          : overrides.originalKey,
      derivatives: overrides.derivatives ?? [
        { type: MediaDerivativeType.DISPLAY, key: 'media/m1/display.webp' },
        { type: MediaDerivativeType.THUMB, key: 'media/m1/thumb.webp' },
      ],
    },
  };
}

describe('DesignAssetsService (TTW-099)', () => {
  let service: DesignAssetsService;
  let prisma: {
    designAsset: { create: jest.Mock; findUnique: jest.Mock };
  };
  let mediaService: { createAssetFromUpload: jest.Mock };
  let s3: { createPrivateReadUrl: jest.Mock };

  beforeEach(() => {
    prisma = {
      designAsset: { create: jest.fn(), findUnique: jest.fn() },
    };
    mediaService = { createAssetFromUpload: jest.fn() };
    s3 = {
      createPrivateReadUrl: jest
        .fn()
        .mockResolvedValue('https://storage.test/signed?X-Amz-Expires=300'),
    };
    service = new DesignAssetsService(
      prisma as unknown as PrismaService,
      mediaService as unknown as MediaService,
      s3 as unknown as S3Service,
    );
  });

  describe('upload', () => {
    it('stores the file as a private asset and returns no storage URL', async () => {
      mediaService.createAssetFromUpload.mockResolvedValue({
        id: 'media-1',
        status: MediaAssetStatus.PENDING,
        originalUrl: 'https://must-not-leak.example/original.png',
      });
      prisma.designAsset.create.mockResolvedValue({ id: 'da-1' });

      const result = await service.upload('user-owner', {
        buffer: Buffer.from('x'),
        mimetype: 'image/png',
      });

      expect(mediaService.createAssetFromUpload).toHaveBeenCalledWith(
        expect.objectContaining({ mimetype: 'image/png' }),
        { visibility: MediaVisibility.PRIVATE },
      );
      expect(result).toEqual({ designAssetId: 'da-1', status: 'pending' });
      expect(JSON.stringify(result)).not.toContain('must-not-leak');
    });
  });

  describe('openFile', () => {
    beforeEach(() => {
      (
        s3 as unknown as { getPrivateObjectStream: jest.Mock }
      ).getPrivateObjectStream = jest.fn().mockResolvedValue({
        stream: 'STREAM',
        contentLength: 9,
      });
    });

    it('streams the original to its owner with the stored mime type', async () => {
      const row = designAssetRow();
      row.mediaAsset = {
        ...row.mediaAsset,
        originalMime: 'image/png',
      } as never;
      prisma.designAsset.findUnique.mockResolvedValue(row);

      const file = await service.openFile(OWNER, 'da-1', 'original');

      expect(file).toEqual({
        stream: 'STREAM',
        contentLength: 9,
        contentType: 'image/png',
      });
      expect(
        (s3 as unknown as { getPrivateObjectStream: jest.Mock })
          .getPrivateObjectStream,
      ).toHaveBeenCalledWith('media/m1/original.png');
    });

    it('serves a derivative as webp', async () => {
      const row = designAssetRow();
      row.mediaAsset.derivatives = [
        {
          type: MediaDerivativeType.THUMB,
          key: 'media/m1/thumb.webp',
          mimeType: 'image/webp',
        },
      ] as never;
      prisma.designAsset.findUnique.mockResolvedValue(row);

      const file = await service.openFile(OWNER, 'da-1', 'thumb');

      expect(file.contentType).toBe('image/webp');
    });

    it('never serves an unexpected mime type, so the browser cannot run it', async () => {
      const row = designAssetRow();
      row.mediaAsset = {
        ...row.mediaAsset,
        originalMime: 'text/html',
      } as never;
      prisma.designAsset.findUnique.mockResolvedValue(row);

      const file = await service.openFile(OWNER, 'da-1', 'original');

      expect(file.contentType).toBe('application/octet-stream');
    });

    it('applies the same access rules as the signed link', async () => {
      prisma.designAsset.findUnique.mockResolvedValue(designAssetRow());

      await expect(
        service.openFile(STRANGER, 'da-1', 'original'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(
        (s3 as unknown as { getPrivateObjectStream: jest.Mock })
          .getPrivateObjectStream,
      ).not.toHaveBeenCalled();
    });
  });

  describe('createReadLink', () => {
    it('gives the owner a short-lived signed link to the original', async () => {
      prisma.designAsset.findUnique.mockResolvedValue(designAssetRow());

      const url = await service.createReadLink(OWNER, 'da-1', 'original');

      expect(url).toBe('https://storage.test/signed?X-Amz-Expires=300');
      expect(s3.createPrivateReadUrl).toHaveBeenCalledWith(
        'media/m1/original.png',
      );
    });

    it('signs the display and thumb derivatives with their own keys', async () => {
      prisma.designAsset.findUnique.mockResolvedValue(designAssetRow());

      await service.createReadLink(OWNER, 'da-1', 'display');
      await service.createReadLink(OWNER, 'da-1', 'thumb');

      expect(s3.createPrivateReadUrl).toHaveBeenNthCalledWith(
        1,
        'media/m1/display.webp',
      );
      expect(s3.createPrivateReadUrl).toHaveBeenNthCalledWith(
        2,
        'media/m1/thumb.webp',
      );
    });

    it('lets the owner read the original while it is still being processed', async () => {
      prisma.designAsset.findUnique.mockResolvedValue(
        designAssetRow({
          status: MediaAssetStatus.PROCESSING,
          scanStatus: VirusScanStatus.PENDING,
          moderationStatus: ModerationStatus.PENDING,
        }),
      );

      await expect(
        service.createReadLink(OWNER, 'da-1', 'original'),
      ).resolves.toEqual(expect.any(String));
    });

    it('answers not found to another customer, without signing anything', async () => {
      prisma.designAsset.findUnique.mockResolvedValue(designAssetRow());

      await expect(
        service.createReadLink(STRANGER, 'da-1', 'original'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(s3.createPrivateReadUrl).not.toHaveBeenCalled();
    });

    it('answers not found for an unknown design asset', async () => {
      prisma.designAsset.findUnique.mockResolvedValue(null);

      await expect(
        service.createReadLink(OWNER, 'nope', 'original'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each([
      ['infected', { scanStatus: VirusScanStatus.INFECTED }],
      ['scan failed', { scanStatus: VirusScanStatus.FAILED }],
      ['processing failed', { status: MediaAssetStatus.FAILED }],
      [
        'rejected by moderation',
        { moderationStatus: ModerationStatus.REJECTED },
      ],
    ])(
      'keeps a file that is %s unusable for its owner',
      async (_label, override) => {
        prisma.designAsset.findUnique.mockResolvedValue(
          designAssetRow(override),
        );

        await expect(
          service.createReadLink(OWNER, 'da-1', 'original'),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(s3.createPrivateReadUrl).not.toHaveBeenCalled();
      },
    );

    it('lets an admin review a file that was rejected', async () => {
      prisma.designAsset.findUnique.mockResolvedValue(
        designAssetRow({ moderationStatus: ModerationStatus.REJECTED }),
      );

      await expect(
        service.createReadLink(ADMIN, 'da-1', 'original'),
      ).resolves.toEqual(expect.any(String));
    });

    it('answers not found when the requested derivative does not exist yet', async () => {
      prisma.designAsset.findUnique.mockResolvedValue(
        designAssetRow({ derivatives: [] }),
      );

      await expect(
        service.createReadLink(OWNER, 'da-1', 'display'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('never signs a legacy public asset from the private bucket', async () => {
      prisma.designAsset.findUnique.mockResolvedValue(
        designAssetRow({ visibility: MediaVisibility.PUBLIC }),
      );

      await expect(
        service.createReadLink(OWNER, 'da-1', 'original'),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(s3.createPrivateReadUrl).not.toHaveBeenCalled();
    });
  });
});
