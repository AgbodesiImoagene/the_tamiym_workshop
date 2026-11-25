import {
  BadRequestException,
  ConflictException,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { Readable } from 'node:stream';
import sharp from 'sharp';
import { VirusScanStatus } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { S3Service } from '../storage/s3.service';
import { VirusScanService } from '../media/virus-scan.service';
import { AVATAR_MAX_BYTES } from './avatar-image';
import { UserAvatarService } from './user-avatar.service';

async function jpeg(): Promise<Buffer> {
  const raw = Buffer.alloc(800 * 600 * 3);
  for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 17) % 256;
  return sharp(raw, { raw: { width: 800, height: 600, channels: 3 } })
    .jpeg()
    .toBuffer();
}

describe('UserAvatarService (TTW-263)', () => {
  let service: UserAvatarService;
  let prisma: {
    user: { findUnique: jest.Mock; updateMany: jest.Mock };
  };
  let s3: {
    uploadPrivateObject: jest.Mock;
    deletePrivateObject: jest.Mock;
    getPrivateObjectStream: jest.Mock;
  };
  let scanner: { scanBuffer: jest.Mock };

  beforeEach(() => {
    prisma = {
      user: {
        findUnique: jest.fn().mockResolvedValue({ avatarKey: null }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    s3 = {
      uploadPrivateObject: jest
        .fn()
        .mockImplementation(({ key }: { key: string }) => ({ key })),
      deletePrivateObject: jest.fn().mockResolvedValue(undefined),
      getPrivateObjectStream: jest.fn(),
    };
    scanner = {
      scanBuffer: jest.fn().mockResolvedValue(VirusScanStatus.CLEAN),
    };
    service = new UserAvatarService(
      prisma as unknown as PrismaService,
      s3 as unknown as S3Service,
      scanner as unknown as VirusScanService,
    );
  });

  describe('setAvatar', () => {
    it('stores a compressed WebP in the private bucket under the user and returns a version', async () => {
      const source = await jpeg();
      const { avatarVersion } = await service.setAvatar('u1', source);

      expect(scanner.scanBuffer).toHaveBeenCalledWith(source);
      const upload = s3.uploadPrivateObject.mock.calls[0][0] as {
        key: string;
        buffer: Buffer;
        contentType: string;
      };
      expect(upload.key).toBe(`avatars/u1/${avatarVersion}.webp`);
      expect(upload.contentType).toBe('image/webp');
      expect((await sharp(upload.buffer).metadata()).format).toBe('webp');
      expect(upload.buffer.length).toBeLessThan(source.length);
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', avatarKey: null },
        data: { avatarKey: upload.key },
      });
      expect(s3.deletePrivateObject).not.toHaveBeenCalled();
    });

    it('deletes the previous object once the new one is referenced', async () => {
      prisma.user.findUnique.mockResolvedValue({
        avatarKey: 'avatars/u1/old.webp',
      });
      await service.setAvatar('u1', await jpeg());
      expect(prisma.user.updateMany.mock.calls[0][0].where).toEqual({
        id: 'u1',
        avatarKey: 'avatars/u1/old.webp',
      });
      expect(s3.deletePrivateObject).toHaveBeenCalledWith(
        'avatars/u1/old.webp',
      );
    });

    it('keeps the new picture when deleting the old one fails', async () => {
      prisma.user.findUnique.mockResolvedValue({
        avatarKey: 'avatars/u1/old.webp',
      });
      s3.deletePrivateObject.mockRejectedValue(new Error('storage down'));
      await expect(service.setAvatar('u1', await jpeg())).resolves.toEqual({
        avatarVersion: expect.any(String),
      });
    });

    it('refuses a file over the size limit before doing anything', async () => {
      await expect(
        service.setAvatar('u1', Buffer.alloc(AVATAR_MAX_BYTES + 1)),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(scanner.scanBuffer).not.toHaveBeenCalled();
      expect(s3.uploadPrivateObject).not.toHaveBeenCalled();
    });

    it('refuses an infected file and stores nothing', async () => {
      scanner.scanBuffer.mockResolvedValue(VirusScanStatus.INFECTED);
      await expect(
        service.setAvatar('u1', await jpeg()),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(s3.uploadPrivateObject).not.toHaveBeenCalled();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('fails closed when the scanner is unavailable', async () => {
      scanner.scanBuffer.mockResolvedValue(VirusScanStatus.FAILED);
      await expect(
        service.setAvatar('u1', await jpeg()),
      ).rejects.toBeInstanceOf(ServiceUnavailableException);
      expect(s3.uploadPrivateObject).not.toHaveBeenCalled();
    });

    it('refuses bytes that are not an image, after the scan, and stores nothing', async () => {
      await expect(
        service.setAvatar('u1', Buffer.from('not an image at all')),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(s3.uploadPrivateObject).not.toHaveBeenCalled();
    });

    it('does not touch the row when the upload to storage fails', async () => {
      s3.uploadPrivateObject.mockRejectedValue(new Error('storage down'));
      await expect(service.setAvatar('u1', await jpeg())).rejects.toThrow();
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
    });

    it('loses cleanly against a concurrent upload: its object is removed and the user can retry', async () => {
      prisma.user.updateMany.mockResolvedValue({ count: 0 });
      await expect(
        service.setAvatar('u1', await jpeg()),
      ).rejects.toBeInstanceOf(ConflictException);
      const uploaded = s3.uploadPrivateObject.mock.calls[0][0] as {
        key: string;
      };
      expect(s3.deletePrivateObject).toHaveBeenCalledWith(uploaded.key);
    });

    it('never logs or returns the storage key', async () => {
      const result = await service.setAvatar('u1', await jpeg());
      expect(JSON.stringify(result)).not.toContain('avatars/');
    });
  });

  describe('removeAvatar', () => {
    it('clears the row, then deletes the object', async () => {
      prisma.user.findUnique.mockResolvedValue({
        avatarKey: 'avatars/u1/a.webp',
      });
      await service.removeAvatar('u1');
      expect(prisma.user.updateMany).toHaveBeenCalledWith({
        where: { id: 'u1', avatarKey: 'avatars/u1/a.webp' },
        data: { avatarKey: null },
      });
      expect(s3.deletePrivateObject).toHaveBeenCalledWith('avatars/u1/a.webp');
    });

    it('is a no-op when there is no picture', async () => {
      await service.removeAvatar('u1');
      expect(prisma.user.updateMany).not.toHaveBeenCalled();
      expect(s3.deletePrivateObject).not.toHaveBeenCalled();
    });
  });

  describe('openAvatar', () => {
    it("streams the caller's own picture as WebP", async () => {
      prisma.user.findUnique.mockResolvedValue({
        avatarKey: 'avatars/u1/a.webp',
      });
      const stream = Readable.from([Buffer.from('x')]);
      s3.getPrivateObjectStream.mockResolvedValue({ stream, contentLength: 1 });
      await expect(service.openAvatar('u1')).resolves.toEqual({
        stream,
        contentType: 'image/webp',
        contentLength: 1,
      });
      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'u1' },
        select: { avatarKey: true },
      });
    });

    it('answers 404 when the user has no picture', async () => {
      await expect(service.openAvatar('u1')).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(s3.getPrivateObjectStream).not.toHaveBeenCalled();
    });
  });
});
