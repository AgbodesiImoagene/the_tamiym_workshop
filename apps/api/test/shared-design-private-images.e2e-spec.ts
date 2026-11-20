import { Readable } from 'node:stream';
import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import {
  hashDesignShareToken,
  mintDesignShareToken,
} from '../src/designs/design-share.crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { S3Service } from '../src/storage/s3.service';
import {
  MediaAssetStatus,
  MediaDerivativeType,
  MediaSourceType,
  MediaVisibility,
  ModerationStatus,
  ProductStatus,
  UserRole,
  UserStatus,
  VirusScanStatus,
} from '../src/generated/prisma/enums';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** In-memory private bucket. */
class InMemoryPrivateS3 {
  readonly objects = new Map<string, Buffer>();
  readonly opened: string[] = [];

  getPrivateObjectStream = (key: string) => {
    this.opened.push(key);
    const bytes = this.objects.get(key) ?? Buffer.alloc(0);
    return Promise.resolve({
      stream: Readable.from([bytes]),
      contentLength: bytes.length,
    });
  };
}

describe('Shared design private images (e2e, TTW-234)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const s3 = new InMemoryPrivateS3();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let productId: string;

  beforeAll(async () => {
    app = await createE2eApp({
      configure: (b) => b.overrideProvider(S3Service).useValue(s3),
    });
    prisma = app.get(PrismaService);
    const category = await prisma.category.create({
      data: { name: `Shared Cat ${stamp}`, slug: `shared-cat-${stamp}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Shared Tee ${stamp}`,
        slug: `shared-tee-${stamp}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  beforeEach(() => {
    s3.opened.length = 0;
  });

  let counter = 0;
  async function createUser() {
    counter += 1;
    return prisma.user.create({
      data: {
        email: `shared-img-${stamp}-${counter}@example.com`,
        passwordHash: await bcrypt.hash('TestPassword1!', 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Shared',
        lastName: 'Image',
        emailVerifiedAt: new Date(),
      },
    });
  }

  async function createAsset(
    ownerUserId: string,
    media: Partial<{
      scanStatus: VirusScanStatus;
      moderationStatus: ModerationStatus;
      status: MediaAssetStatus;
    }> = {},
  ) {
    counter += 1;
    const originalKey = `media/e2e-${stamp}-${counter}/original.png`;
    s3.objects.set(originalKey, PNG);
    const mediaAsset = await prisma.mediaAsset.create({
      data: {
        sourceType: MediaSourceType.UPLOAD,
        visibility: MediaVisibility.PRIVATE,
        status: media.status ?? MediaAssetStatus.READY,
        scanStatus: media.scanStatus ?? VirusScanStatus.CLEAN,
        moderationStatus: media.moderationStatus ?? ModerationStatus.APPROVED,
        originalKey,
        originalMime: 'image/png',
        derivatives: {
          create: [
            {
              type: MediaDerivativeType.ORIGINAL,
              key: originalKey,
              url: null,
              mimeType: 'image/png',
              sizeBytes: PNG.length,
            },
          ],
        },
      },
    });
    return prisma.designAsset.create({
      data: { ownerUserId, mediaAssetId: mediaAsset.id },
    });
  }

  async function createSharedDesign(
    ownerId: string,
    referencedAssetIds: string[],
    options: Partial<{
      moderationStatus: ModerationStatus;
      expiresAt: Date;
      revokedAt: Date | null;
    }> = {},
  ) {
    counter += 1;
    const design = await prisma.design.create({
      data: {
        userId: ownerId,
        productId,
        name: `Shared design ${stamp}-${counter}`,
        moderationStatus: options.moderationStatus ?? ModerationStatus.APPROVED,
        designData: {
          version: 1,
          productId,
          views: {
            front: {
              fabricJson: {
                objects: referencedAssetIds.map((id) => ({
                  type: 'image',
                  data: { designAssetId: id },
                })),
              },
            },
          },
        },
      },
    });
    const token = mintDesignShareToken();
    await prisma.designShareLink.create({
      data: {
        designId: design.id,
        tokenHash: hashDesignShareToken(token),
        policyVersion: 'e2e',
        expiresAt: options.expiresAt ?? new Date(Date.now() + 3_600_000),
        revokedAt: options.revokedAt ?? null,
      },
    });
    return { design, token };
  }

  const fileUrl = (token: string, designAssetId: string, query = '') =>
    `/v1/public/designs/${token}/assets/${designAssetId}/file${query}`;

  it('shows the image to an anonymous visitor with a valid link', async () => {
    const owner = await createUser();
    const asset = await createAsset(owner.id);
    const { token } = await createSharedDesign(owner.id, [asset.id]);

    const res = await request(app.getHttpServer())
      .get(fileUrl(token, asset.id, '?variant=original'))
      .expect(200);

    expect(res.headers['content-type']).toMatch(/^image\/png/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(res.headers['cache-control']).toMatch(/private/);
    expect(res.headers['x-robots-tag']).toMatch(/noindex/);
    expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
  });

  it('defaults to the original when no variant is given', async () => {
    const owner = await createUser();
    const asset = await createAsset(owner.id);
    const { token } = await createSharedDesign(owner.id, [asset.id]);

    await request(app.getHttpServer())
      .get(fileUrl(token, asset.id))
      .expect(200);
  });

  it('rejects an unknown variant', async () => {
    const owner = await createUser();
    const asset = await createAsset(owner.id);
    const { token } = await createSharedDesign(owner.id, [asset.id]);

    await request(app.getHttpServer())
      .get(fileUrl(token, asset.id, '?variant=raw'))
      .expect(400);
  });

  it('answers 404 for an unknown token', async () => {
    const owner = await createUser();
    const asset = await createAsset(owner.id);

    await request(app.getHttpServer())
      .get(fileUrl(mintDesignShareToken(), asset.id))
      .expect(404);
    expect(s3.opened).toEqual([]);
  });

  it('closes the image when the link is revoked or expired, at once', async () => {
    const owner = await createUser();
    const asset = await createAsset(owner.id);
    const revoked = await createSharedDesign(owner.id, [asset.id], {
      revokedAt: new Date(),
    });
    const expired = await createSharedDesign(owner.id, [asset.id], {
      expiresAt: new Date(Date.now() - 1_000),
    });
    const live = await createSharedDesign(owner.id, [asset.id]);

    await request(app.getHttpServer())
      .get(fileUrl(live.token, asset.id))
      .expect(200);
    await prisma.designShareLink.updateMany({
      where: { designId: live.design.id },
      data: { revokedAt: new Date() },
    });

    for (const { token } of [revoked, expired, live]) {
      await request(app.getHttpServer())
        .get(fileUrl(token, asset.id))
        .expect(404);
    }
  });

  it('answers 404 when the design is not approved', async () => {
    const owner = await createUser();
    const asset = await createAsset(owner.id);
    const { token } = await createSharedDesign(owner.id, [asset.id], {
      moderationStatus: ModerationStatus.FLAGGED,
    });

    await request(app.getHttpServer())
      .get(fileUrl(token, asset.id))
      .expect(404);
  });

  it('answers 404 for an asset the shared design does not reference', async () => {
    const owner = await createUser();
    const used = await createAsset(owner.id);
    const notUsed = await createAsset(owner.id);
    const { token } = await createSharedDesign(owner.id, [used.id]);

    await request(app.getHttpServer())
      .get(fileUrl(token, notUsed.id))
      .expect(404);
    expect(s3.opened).toEqual([]);
  });

  it('does not let a link open the image of another design, even with a valid asset id', async () => {
    const ownerA = await createUser();
    const ownerB = await createUser();
    const assetB = await createAsset(ownerB.id);
    await createSharedDesign(ownerB.id, [assetB.id]);
    const linkA = await createSharedDesign(ownerA.id, []);

    await request(app.getHttpServer())
      .get(fileUrl(linkA.token, assetB.id))
      .expect(404);
  });

  it('does not let a design expose a file that belongs to another customer', async () => {
    const owner = await createUser();
    const victim = await createUser();
    const victimAsset = await createAsset(victim.id);
    // The attacker writes the victim's asset id into their own design and shares it.
    const { token } = await createSharedDesign(owner.id, [victimAsset.id]);

    await request(app.getHttpServer())
      .get(fileUrl(token, victimAsset.id))
      .expect(404);
    expect(s3.opened).toEqual([]);
  });

  it.each([
    ['infected', { scanStatus: VirusScanStatus.INFECTED }],
    ['scan failed', { scanStatus: VirusScanStatus.FAILED }],
    ['processing failed', { status: MediaAssetStatus.FAILED }],
    ['rejected by moderation', { moderationStatus: ModerationStatus.REJECTED }],
  ])('answers 404 for a file that is %s', async (_label, media) => {
    const owner = await createUser();
    const asset = await createAsset(owner.id, media);
    const { token } = await createSharedDesign(owner.id, [asset.id]);

    await request(app.getHttpServer())
      .get(fileUrl(token, asset.id))
      .expect(404);
    expect(s3.opened).toEqual([]);
  });

  it('answers 404 for a rendition that is not generated yet', async () => {
    const owner = await createUser();
    const asset = await createAsset(owner.id);
    const { token } = await createSharedDesign(owner.id, [asset.id]);

    await request(app.getHttpServer())
      .get(fileUrl(token, asset.id, '?variant=display'))
      .expect(404);
  });
});
