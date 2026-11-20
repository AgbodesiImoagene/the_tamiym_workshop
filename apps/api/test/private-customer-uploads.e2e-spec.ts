import { Readable } from 'node:stream';
import { INestApplication, InternalServerErrorException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { generateTotpCode } from '../src/auth/admin-mfa.totp';
import { AuthService, isMfaChallengeResponse } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { S3Service } from '../src/storage/s3.service';
import {
  AuthSurface,
  MediaDerivativeType,
  MediaVisibility,
  ModerationStatus,
  UserRole,
  UserStatus,
  VirusScanStatus,
} from '../src/generated/prisma/enums';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

const PASSWORD = 'TestPassword1!';

// 1x1 transparent PNG.
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** In-memory object store: one public bucket, one private bucket. */
class InMemoryS3 {
  readonly publicObjects = new Map<string, Buffer>();
  readonly privateObjects = new Map<string, Buffer>();
  readonly signedTtls: number[] = [];
  failPrivateUpload = false;
  failSigning = false;
  failStreaming = false;

  uploadObject = (p: { key: string; buffer: Buffer }) => {
    this.publicObjects.set(p.key, p.buffer);
    return Promise.resolve({
      key: p.key,
      url: `https://public.storage.test/${p.key}`,
    });
  };

  getObjectBuffer = (key: string) =>
    Promise.resolve(this.publicObjects.get(key) ?? Buffer.alloc(0));

  uploadPrivateObject = (p: { key: string; buffer: Buffer }) => {
    if (this.failPrivateUpload) {
      return Promise.reject(
        new InternalServerErrorException('Failed to upload image'),
      );
    }
    this.privateObjects.set(p.key, p.buffer);
    return Promise.resolve({ key: p.key });
  };

  getPrivateObjectBuffer = (key: string) =>
    Promise.resolve(this.privateObjects.get(key) ?? Buffer.alloc(0));

  getPrivateObjectStream = (key: string) => {
    if (this.failStreaming) {
      return Promise.reject(new InternalServerErrorException('storage down'));
    }
    const bytes = this.privateObjects.get(key) ?? Buffer.alloc(0);
    return Promise.resolve({
      stream: Readable.from([bytes]),
      contentLength: bytes.length,
    });
  };

  createPrivateReadUrl = (key: string, ttlSeconds = 300) => {
    if (this.failSigning) {
      return Promise.reject(new InternalServerErrorException('storage down'));
    }
    this.signedTtls.push(ttlSeconds);
    return Promise.resolve(
      `https://private.storage.test/${key}?X-Amz-Expires=${ttlSeconds}&X-Amz-Signature=abc`,
    );
  };
}

describe('Private customer uploads (e2e, TTW-099)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;
  const s3 = new InMemoryS3();

  beforeAll(async () => {
    app = await createE2eApp({
      configure: (b) => b.overrideProvider(S3Service).useValue(s3),
    });
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  beforeEach(() => {
    s3.failPrivateUpload = false;
    s3.failSigning = false;
    s3.failStreaming = false;
    s3.signedTtls.length = 0;
  });

  async function createUser(role: UserRole) {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await prisma.user.create({
      data: {
        email: `private-upload-${stamp}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role,
        status: UserStatus.ACTIVE,
        firstName: 'Private',
        lastName: 'Upload',
        phone: '+2348011111111',
        emailVerifiedAt: new Date(),
      },
    });
    if (role === UserRole.ADMIN) {
      const challenge = await authService.login(
        { email: user.email, password: PASSWORD },
        AuthSurface.ADMIN,
      );
      if (!isMfaChallengeResponse(challenge)) {
        throw new Error('expected MFA enrollment challenge');
      }
      const enrollment = await authService.adminMfaEnrollStart(
        challenge.mfa_token,
      );
      const session = await authService.adminMfaEnrollConfirm(
        challenge.mfa_token,
        generateTotpCode(enrollment.secret),
      );
      return { user, token: session.access_token };
    }
    const session = await authService.login(
      { email: user.email, password: PASSWORD },
      AuthSurface.CUSTOMER,
    );
    return { user, token: session.access_token };
  }

  function upload(token: string) {
    return request(app.getHttpServer())
      .post('/v1/design-assets/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG, { filename: 'logo.png', contentType: 'image/png' });
  }

  it('stores a customer upload privately and returns no storage URL', async () => {
    const owner = await createUser(UserRole.CUSTOMER);

    const res = await upload(owner.token).expect(201);

    expect(res.body.designAssetId).toEqual(expect.any(String));
    expect(res.body).not.toHaveProperty('originalUrl');
    expect(JSON.stringify(res.body)).not.toContain('storage.test');

    const row = await prisma.designAsset.findUniqueOrThrow({
      where: { id: res.body.designAssetId },
      include: { mediaAsset: { include: { derivatives: true } } },
    });
    expect(row.mediaAsset.visibility).toBe(MediaVisibility.PRIVATE);
    expect(row.mediaAsset.originalUrl).toBeNull();
    expect(row.mediaAsset.derivatives.map((d) => d.url)).toEqual([null]);
    // Nothing of this upload is in the public bucket.
    expect(
      [...s3.publicObjects.keys()].some((k) => k.includes(row.mediaAssetId)),
    ).toBe(false);
    expect(s3.privateObjects.has(row.mediaAsset.originalKey as string)).toBe(
      true,
    );
  });

  it('refuses the upload and keeps no readable file when private storage is down', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    s3.failPrivateUpload = true;

    await upload(owner.token).expect(500);

    expect(s3.publicObjects.size).toBe(0);
  });

  it('gives the owner a short-lived signed link in JSON, never a stored URL', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const { body } = await upload(owner.token).expect(201);

    const res = await request(app.getHttpServer())
      .get(`/v1/design-assets/${body.designAssetId}/link?variant=original`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(res.body.url).toMatch(
      /^https:\/\/private\.storage\.test\/media\/.+\/original\.png\?X-Amz-Expires=300/,
    );
    expect(res.body.expiresInSeconds).toBe(300);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(s3.signedTtls).toEqual([300]);
  });

  it('streams the file to its owner with safe headers', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const { body } = await upload(owner.token).expect(201);

    const res = await request(app.getHttpServer())
      .get(`/v1/design-assets/${body.designAssetId}/file?variant=original`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(res.headers['content-type']).toMatch(/^image\/png/);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['cache-control']).toMatch(/private/);
    expect(res.headers['cache-control']).toMatch(/no-store/);
    expect(Buffer.compare(res.body as Buffer, PNG)).toBe(0);
    // The file never goes through a storage link.
    expect(res.headers.location).toBeUndefined();
    expect(s3.signedTtls).toEqual([]);
  });

  it('answers 401 without a session and 404 to another customer', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const stranger = await createUser(UserRole.CUSTOMER);
    const { body } = await upload(owner.token).expect(201);
    for (const endpoint of ['file', 'link']) {
      const path = `/v1/design-assets/${body.designAssetId}/${endpoint}?variant=original`;
      await request(app.getHttpServer()).get(path).expect(401);
      await request(app.getHttpServer())
        .get(path)
        .set('Authorization', `Bearer ${stranger.token}`)
        .expect(404);
    }
    expect(s3.signedTtls).toEqual([]);
  });

  it('rejects an unknown variant', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const { body } = await upload(owner.token).expect(201);

    await request(app.getHttpServer())
      .get(`/v1/design-assets/${body.designAssetId}/file?variant=raw`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(400);
  });

  it('keeps an infected file unusable for the owner but reviewable by an admin', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const admin = await createUser(UserRole.ADMIN);
    const { body } = await upload(owner.token).expect(201);
    const designAsset = await prisma.designAsset.findUniqueOrThrow({
      where: { id: body.designAssetId },
    });
    await prisma.mediaAsset.update({
      where: { id: designAsset.mediaAssetId },
      data: {
        scanStatus: VirusScanStatus.INFECTED,
        moderationStatus: ModerationStatus.REJECTED,
      },
    });
    const path = `/v1/design-assets/${body.designAssetId}/file?variant=original`;

    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
    await request(app.getHttpServer())
      .get(path)
      .set('Authorization', `Bearer ${admin.token}`)
      .expect(200);
  });

  it('answers 404 for a derivative that is not generated yet', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const { body } = await upload(owner.token).expect(201);
    const derivatives = await prisma.mediaDerivative.findMany({
      where: { asset: { designAssets: { some: { id: body.designAssetId } } } },
    });
    expect(derivatives.map((d) => d.type)).toEqual([
      MediaDerivativeType.ORIGINAL,
    ]);

    await request(app.getHttpServer())
      .get(`/v1/design-assets/${body.designAssetId}/file?variant=display`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(404);
  });

  it('fails closed with a 500 and no link when signing is unavailable', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const { body } = await upload(owner.token).expect(201);
    s3.failSigning = true;

    const res = await request(app.getHttpServer())
      .get(`/v1/design-assets/${body.designAssetId}/link?variant=original`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(500);

    expect(res.body.url).toBeUndefined();
  });

  it('fails closed with a 500 and no bytes when private storage is unavailable', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const { body } = await upload(owner.token).expect(201);
    s3.failStreaming = true;

    const res = await request(app.getHttpServer())
      .get(`/v1/design-assets/${body.designAssetId}/file?variant=original`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(500);

    expect(res.headers['content-type']).not.toMatch(/image/);
  });
});
