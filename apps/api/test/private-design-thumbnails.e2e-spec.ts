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
  ModerationStatus,
  ProductStatus,
  UserRole,
  UserStatus,
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

  uploadObject = (p: { key: string; buffer: Buffer }) => {
    this.publicObjects.set(p.key, p.buffer);
    return Promise.resolve({
      key: p.key,
      url: `https://public.storage.test/${p.key}`,
    });
  };

  uploadPrivateObject = (p: { key: string; buffer: Buffer }) => {
    this.privateObjects.set(p.key, p.buffer);
    return Promise.resolve({ key: p.key });
  };

  getPrivateObjectBuffer = (key: string) => {
    const bytes = this.privateObjects.get(key);
    return bytes
      ? Promise.resolve(bytes)
      : Promise.reject(new InternalServerErrorException('missing'));
  };

  getPrivateObjectStream = (key: string) => {
    const bytes = this.privateObjects.get(key);
    if (!bytes) {
      return Promise.reject(new InternalServerErrorException('missing'));
    }
    return Promise.resolve({
      stream: Readable.from([bytes]),
      contentLength: bytes.length,
    });
  };
}

describe('Private design thumbnails (e2e, TTW-237)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;
  const s3 = new InMemoryS3();
  const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let productId: string;
  let counter = 0;

  beforeAll(async () => {
    app = await createE2eApp({
      configure: (b) => b.overrideProvider(S3Service).useValue(s3),
    });
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);
    const category = await prisma.category.create({
      data: { name: `Thumb Cat ${stamp}`, slug: `thumb-cat-${stamp}` },
    });
    const product = await prisma.product.create({
      data: {
        name: `Thumb Tee ${stamp}`,
        slug: `thumb-tee-${stamp}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
      },
    });
    productId = product.id;
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function createUser(role: UserRole) {
    counter += 1;
    const user = await prisma.user.create({
      data: {
        email: `thumb-${stamp}-${counter}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role,
        status: UserStatus.ACTIVE,
        firstName: 'Thumb',
        lastName: 'Nail',
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

  async function createDesign(token: string) {
    const res = await request(app.getHttpServer())
      .post('/v1/designs')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'Thumb design',
        productId,
        designData: { version: 1, views: {} },
      })
      .expect(201);
    return res.body.id as string;
  }

  function uploadThumbnail(token: string, designId: string, bytes = PNG) {
    return request(app.getHttpServer())
      .post(`/v1/designs/${designId}/thumbnail`)
      .set('Authorization', `Bearer ${token}`)
      .attach('thumbnail', bytes, {
        filename: 'thumb.png',
        contentType: 'image/png',
      });
  }

  const read = (designId: string) =>
    request(app.getHttpServer()).get(`/v1/designs/${designId}/thumbnail`);

  const setStatus = (designId: string, moderationStatus: ModerationStatus) =>
    prisma.design.update({
      where: { id: designId },
      data: { moderationStatus },
    });

  it('stores the picture in the private bucket only and keeps an API path, never a storage address', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const id = await createDesign(owner.token);

    const res = await uploadThumbnail(owner.token, id).expect(200);

    expect(res.body).toEqual({ thumbnailUrl: `/designs/${id}/thumbnail` });
    const row = await prisma.design.findUniqueOrThrow({ where: { id } });
    expect(row.thumbnailUrl).toBe(`/designs/${id}/thumbnail`);
    const stored = s3.privateObjects.get(`design-thumbnails/${id}`);
    expect(stored).toBeDefined();
    expect(stored!.subarray(0, 4).toString()).toBe('RIFF');
    expect(stored!.subarray(8, 12).toString()).toBe('WEBP');
    expect([...s3.publicObjects.keys()].some((k) => k.includes(id))).toBe(
      false,
    );
    expect(JSON.stringify(res.body)).not.toContain('storage.test');
  });

  it('serves the owner and an admin whatever the status, with safe headers', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const admin = await createUser(UserRole.ADMIN);
    const id = await createDesign(owner.token);
    await uploadThumbnail(owner.token, id).expect(200);

    for (const status of [
      ModerationStatus.PENDING,
      ModerationStatus.FLAGGED,
      ModerationStatus.REJECTED,
    ]) {
      await setStatus(id, status);
      for (const actor of [owner, admin]) {
        const res = await read(id)
          .set('Authorization', `Bearer ${actor.token}`)
          .expect(200);
        expect(res.headers['content-type']).toMatch(/^image\/webp/);
        expect(res.headers['x-content-type-options']).toBe('nosniff');
        expect(res.headers['cache-control']).toMatch(/private/);
        expect(res.headers['cache-control']).toMatch(/no-store/);
        expect(res.headers['x-robots-tag']).toMatch(/noindex/);
        expect(res.headers.location).toBeUndefined();
        expect(
          Buffer.compare(
            res.body as Buffer,
            s3.privateObjects.get(`design-thumbnails/${id}`)!,
          ),
        ).toBe(0);
      }
    }
  });

  it('answers a visitor and another customer 404 unless the design is APPROVED, with the same body as an unknown id', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const stranger = await createUser(UserRole.CUSTOMER);
    const id = await createDesign(owner.token);
    await uploadThumbnail(owner.token, id).expect(200);
    const unknown = await read('does-not-exist').expect(404);

    for (const status of [
      ModerationStatus.PENDING,
      ModerationStatus.FLAGGED,
      ModerationStatus.REJECTED,
    ]) {
      await setStatus(id, status);
      const visitor = await read(id).expect(404);
      const other = await read(id)
        .set('Authorization', `Bearer ${stranger.token}`)
        .expect(404);
      expect(visitor.body.message).toBe(unknown.body.message);
      expect(visitor.body.statusCode).toBe(unknown.body.statusCode);
      expect(other.body.message).toBe(unknown.body.message);
    }

    await setStatus(id, ModerationStatus.APPROVED);
    await read(id).expect(200);
    await read(id).set('Authorization', `Bearer ${stranger.token}`).expect(200);
  });

  it('closes the thumbnail at once when an approved design is rejected', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const id = await createDesign(owner.token);
    await uploadThumbnail(owner.token, id).expect(200);
    await setStatus(id, ModerationStatus.APPROVED);
    await read(id).expect(200);

    await setStatus(id, ModerationStatus.REJECTED);

    await read(id).expect(404);
    await read(id).set('Authorization', `Bearer ${owner.token}`).expect(200);
  });

  it('treats an invalid or expired session as a visitor, never as a 401', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const id = await createDesign(owner.token);
    await uploadThumbnail(owner.token, id).expect(200);

    await read(id).set('Authorization', 'Bearer not-a-token').expect(404);
    await setStatus(id, ModerationStatus.APPROVED);
    await read(id).set('Authorization', 'Bearer not-a-token').expect(200);
  });

  it('answers 404 for a design that has no thumbnail yet', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const id = await createDesign(owner.token);
    await read(id).set('Authorization', `Bearer ${owner.token}`).expect(404);
  });

  it('refuses a client-supplied thumbnailUrl on create and update', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    await request(app.getHttpServer())
      .post('/v1/designs')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({
        name: 'x',
        productId,
        designData: { version: 1, views: {} },
        thumbnailUrl: 'https://evil.example.com/a.png',
      })
      .expect(400);
    const id = await createDesign(owner.token);
    await request(app.getHttpServer())
      .patch(`/v1/designs/${id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ thumbnailUrl: 'https://evil.example.com/a.png' })
      .expect(400);
  });

  it('refuses bytes that are not an image and stores nothing', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const id = await createDesign(owner.token);
    await uploadThumbnail(
      owner.token,
      id,
      Buffer.from('<html>not an image</html>'),
    ).expect(400);
    expect(s3.privateObjects.has(`design-thumbnails/${id}`)).toBe(false);
    const row = await prisma.design.findUniqueOrThrow({ where: { id } });
    expect(row.thumbnailUrl).toBeNull();
  });

  it('screens a replacement picture again: an APPROVED design does not stay approved by itself', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const id = await createDesign(owner.token);
    await uploadThumbnail(owner.token, id).expect(200);
    await setStatus(id, ModerationStatus.APPROVED);
    await read(id).expect(200);

    await uploadThumbnail(owner.token, id).expect(200);

    const row = await prisma.design.findUniqueOrThrow({ where: { id } });
    expect(row.moderationStatus).not.toBe(ModerationStatus.APPROVED);
    await read(id).expect(404);
    const decisions = await prisma.moderationDecision.count({
      where: { subjectId: id },
    });
    expect(decisions).toBeGreaterThanOrEqual(2);
  });

  it('keeps a rejected design rejected when the owner uploads a new picture', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const id = await createDesign(owner.token);
    await setStatus(id, ModerationStatus.REJECTED);

    await uploadThumbnail(owner.token, id).expect(200);

    const row = await prisma.design.findUniqueOrThrow({ where: { id } });
    expect(row.moderationStatus).toBe(ModerationStatus.REJECTED);
    await read(id).expect(404);
  });

  it('ends with one object and one consistent column after two simultaneous uploads', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const id = await createDesign(owner.token);

    const [a, b] = await Promise.all([
      uploadThumbnail(owner.token, id),
      uploadThumbnail(owner.token, id),
    ]);

    expect([a.status, b.status]).toEqual([200, 200]);
    const keys = [...s3.privateObjects.keys()].filter((k) => k.includes(id));
    expect(keys).toEqual([`design-thumbnails/${id}`]);
    const row = await prisma.design.findUniqueOrThrow({ where: { id } });
    expect(row.thumbnailUrl).toBe(`/designs/${id}/thumbnail`);
  });

  it('gives a duplicate its own picture and its own path, closed to visitors while pending', async () => {
    const owner = await createUser(UserRole.CUSTOMER);
    const id = await createDesign(owner.token);
    await uploadThumbnail(owner.token, id).expect(200);
    await setStatus(id, ModerationStatus.APPROVED);

    const dup = await request(app.getHttpServer())
      .post(`/v1/designs/${id}/duplicate`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(201);

    const copyId = dup.body.id as string;
    expect(copyId).not.toBe(id);
    expect(dup.body.thumbnailUrl).toBe(`/designs/${copyId}/thumbnail`);
    expect(s3.privateObjects.has(`design-thumbnails/${copyId}`)).toBe(true);
    await read(copyId).expect(404);
    await read(copyId)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    // The original is untouched and still readable by a visitor.
    await read(id).expect(200);
  });
});
