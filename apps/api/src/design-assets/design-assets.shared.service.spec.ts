import { NotFoundException } from '@nestjs/common';
import { DesignAssetsService } from './design-assets.service';
import type { DesignAssetVariant } from './design-assets.service';
import { PrismaService } from '../prisma/prisma.service';
import { MediaService } from '../media/media.service';
import { S3Service } from '../storage/s3.service';
import { hashDesignShareToken } from '../designs/design-share.crypto';
import {
  MediaAssetStatus,
  MediaDerivativeType,
  MediaVisibility,
  ModerationStatus,
  VirusScanStatus,
} from '../generated/prisma/enums';

const TOKEN = 'a'.repeat(43);
const DESIGN_OWNER = 'user-owner';

function designData(...ids: string[]) {
  return {
    views: {
      front: {
        fabricJson: {
          objects: ids.map((id) => ({
            type: 'image',
            data: { designAssetId: id },
          })),
        },
      },
    },
  };
}

function linkRow(
  overrides: Partial<{
    expiresAt: Date;
    revokedAt: Date | null;
    moderationStatus: ModerationStatus;
    data: unknown;
  }> = {},
) {
  return {
    expiresAt: overrides.expiresAt ?? new Date(Date.now() + 60_000),
    revokedAt: overrides.revokedAt ?? null,
    design: {
      userId: DESIGN_OWNER,
      moderationStatus: overrides.moderationStatus ?? ModerationStatus.APPROVED,
      designData: overrides.data ?? designData('da-1'),
    },
  };
}

function assetRow(
  overrides: Partial<{
    ownerUserId: string;
    status: MediaAssetStatus;
    scanStatus: VirusScanStatus;
    moderationStatus: ModerationStatus;
    visibility: MediaVisibility;
    derivatives: { type: MediaDerivativeType; key: string; mimeType: string }[];
  }> = {},
) {
  return {
    ownerUserId: overrides.ownerUserId ?? DESIGN_OWNER,
    mediaAsset: {
      status: overrides.status ?? MediaAssetStatus.READY,
      scanStatus: overrides.scanStatus ?? VirusScanStatus.CLEAN,
      moderationStatus: overrides.moderationStatus ?? ModerationStatus.APPROVED,
      visibility: overrides.visibility ?? MediaVisibility.PRIVATE,
      originalKey: 'media/m1/original.png',
      originalMime: 'image/png',
      derivatives: overrides.derivatives ?? [
        {
          type: MediaDerivativeType.THUMB,
          key: 'media/m1/thumb.webp',
          mimeType: 'image/webp',
        },
      ],
    },
  };
}

describe('DesignAssetsService.openSharedFile (TTW-234)', () => {
  let service: DesignAssetsService;
  let prisma: {
    designShareLink: { findUnique: jest.Mock };
    designAsset: { findUnique: jest.Mock };
  };
  let s3: { getPrivateObjectStream: jest.Mock };

  beforeEach(() => {
    prisma = {
      designShareLink: { findUnique: jest.fn().mockResolvedValue(linkRow()) },
      designAsset: { findUnique: jest.fn().mockResolvedValue(assetRow()) },
    };
    s3 = {
      getPrivateObjectStream: jest
        .fn()
        .mockResolvedValue({ stream: 'STREAM', contentLength: 5 }),
    };
    service = new DesignAssetsService(
      prisma as unknown as PrismaService,
      {} as unknown as MediaService,
      s3 as unknown as S3Service,
    );
  });

  it('streams the image to the holder of a valid link, looked up by hash', async () => {
    const file = await service.openSharedFile(TOKEN, 'da-1', 'original');

    expect(file).toEqual({
      stream: 'STREAM',
      contentLength: 5,
      contentType: 'image/png',
    });
    expect(prisma.designShareLink.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tokenHash: hashDesignShareToken(TOKEN) },
      }),
    );
    expect(s3.getPrivateObjectStream).toHaveBeenCalledWith(
      'media/m1/original.png',
    );
  });

  it('serves a derivative with its own key', async () => {
    await service.openSharedFile(TOKEN, 'da-1', 'thumb');

    expect(s3.getPrivateObjectStream).toHaveBeenCalledWith(
      'media/m1/thumb.webp',
    );
  });

  const denials: [string, () => unknown, string, DesignAssetVariant?][] = [
    ['a token that is too short', () => undefined, 'short'],
    [
      'an unknown link',
      () => prisma.designShareLink.findUnique.mockResolvedValue(null),
      TOKEN,
    ],
    [
      'a revoked link',
      () =>
        prisma.designShareLink.findUnique.mockResolvedValue(
          linkRow({ revokedAt: new Date() }),
        ),
      TOKEN,
    ],
    [
      'an expired link',
      () =>
        prisma.designShareLink.findUnique.mockResolvedValue(
          linkRow({ expiresAt: new Date(Date.now() - 1) }),
        ),
      TOKEN,
    ],
    [
      'a design that is not approved',
      () =>
        prisma.designShareLink.findUnique.mockResolvedValue(
          linkRow({ moderationStatus: ModerationStatus.FLAGGED }),
        ),
      TOKEN,
    ],
    [
      'an asset the design does not reference',
      () =>
        prisma.designShareLink.findUnique.mockResolvedValue(
          linkRow({ data: designData('da-other') }),
        ),
      TOKEN,
    ],
    [
      'an asset that belongs to another customer',
      () =>
        prisma.designAsset.findUnique.mockResolvedValue(
          assetRow({ ownerUserId: 'user-someone-else' }),
        ),
      TOKEN,
    ],
    [
      'an unknown design asset',
      () => prisma.designAsset.findUnique.mockResolvedValue(null),
      TOKEN,
    ],
    [
      'an infected file',
      () =>
        prisma.designAsset.findUnique.mockResolvedValue(
          assetRow({ scanStatus: VirusScanStatus.INFECTED }),
        ),
      TOKEN,
    ],
    [
      'a file whose scan failed',
      () =>
        prisma.designAsset.findUnique.mockResolvedValue(
          assetRow({ scanStatus: VirusScanStatus.FAILED }),
        ),
      TOKEN,
    ],
    [
      'a file that failed processing',
      () =>
        prisma.designAsset.findUnique.mockResolvedValue(
          assetRow({ status: MediaAssetStatus.FAILED }),
        ),
      TOKEN,
    ],
    [
      'a file rejected by moderation',
      () =>
        prisma.designAsset.findUnique.mockResolvedValue(
          assetRow({ moderationStatus: ModerationStatus.REJECTED }),
        ),
      TOKEN,
    ],
    [
      'a legacy public asset',
      () =>
        prisma.designAsset.findUnique.mockResolvedValue(
          assetRow({ visibility: MediaVisibility.PUBLIC }),
        ),
      TOKEN,
    ],
    [
      'a rendition that is not generated yet',
      () =>
        prisma.designAsset.findUnique.mockResolvedValue(
          assetRow({ derivatives: [] }),
        ),
      TOKEN,
      'display' as const,
    ],
  ];

  describe.each(denials)(
    'answers not found for %s',
    (_label, arrange, token, variant) => {
      it('and never opens the storage', async () => {
        arrange();

        await expect(
          service.openSharedFile(token, 'da-1', variant ?? 'original'),
        ).rejects.toBeInstanceOf(NotFoundException);
        expect(s3.getPrivateObjectStream).not.toHaveBeenCalled();
      });
    },
  );

  it('reads the asset only after the link and the design reference are proven', async () => {
    prisma.designShareLink.findUnique.mockResolvedValue(
      linkRow({ data: designData('da-other') }),
    );

    await expect(
      service.openSharedFile(TOKEN, 'da-1', 'original'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.designAsset.findUnique).not.toHaveBeenCalled();
  });
});
