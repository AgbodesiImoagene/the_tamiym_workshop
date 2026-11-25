import { Readable } from 'node:stream';
import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import sharp from 'sharp';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthService } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import { S3Service } from '../src/storage/s3.service';
import {
  AuthSurface,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

const PASSWORD = 'TestPassword1!';

/** In-memory private bucket: real routes, real Postgres, no network. */
class InMemoryPrivateBucket {
  readonly objects = new Map<string, Buffer>();
  uploadPrivateObject = (p: { key: string; buffer: Buffer }) => {
    this.objects.set(p.key, p.buffer);
    return Promise.resolve({ key: p.key });
  };
  deletePrivateObject = (key: string) => {
    this.objects.delete(key);
    return Promise.resolve();
  };
  getPrivateObjectStream = (key: string) => {
    const bytes = this.objects.get(key) ?? Buffer.alloc(0);
    return Promise.resolve({
      stream: Readable.from([bytes]),
      contentLength: bytes.length,
    });
  };
}

async function photo(width = 1600, height = 1200): Promise<Buffer> {
  const raw = Buffer.alloc(width * height * 3);
  for (let i = 0; i < raw.length; i += 1) raw[i] = (i * 31 + (i >> 3)) % 256;
  return sharp(raw, { raw: { width, height, channels: 3 } })
    .jpeg({ quality: 95 })
    .toBuffer();
}

describe('User profile picture (e2e, TTW-263)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;
  const bucket = new InMemoryPrivateBucket();

  beforeAll(async () => {
    app = await createE2eApp({
      configure: (b) => b.overrideProvider(S3Service).useValue(bucket),
    });
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function customer() {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const user = await prisma.user.create({
      data: {
        email: `avatar-${stamp}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Ava',
        lastName: 'Tar',
        emailVerifiedAt: new Date(),
      },
    });
    const session = await authService.login(
      { email: user.email, password: PASSWORD },
      AuthSurface.CUSTOMER,
    );
    return { user, token: session.access_token };
  }

  const post = (token: string, file: Buffer, name = 'me.jpg') =>
    request(app.getHttpServer())
      .post('/v1/users/profile/avatar')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', file, { filename: name, contentType: 'image/jpeg' });

  const me = (token: string) =>
    request(app.getHttpServer())
      .get('/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);

  it('compresses the upload, stores it privately and shows it in /auth/me and the picture route', async () => {
    const { user, token } = await customer();
    const source = await photo();

    const res = await post(token, source).expect(201);
    expect(res.body.avatarVersion).toMatch(/^[0-9a-f]{32}$/);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    expect(row.avatarKey).toBe(
      `avatars/${user.id}/${res.body.avatarVersion}.webp`,
    );
    const stored = bucket.objects.get(row.avatarKey as string) as Buffer;
    const meta = await sharp(stored).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', 256, 256]);
    expect(stored.length).toBeLessThan(source.length / 10);

    const who = await me(token).expect(200);
    expect(who.body.avatarVersion).toBe(res.body.avatarVersion);
    expect(JSON.stringify(who.body)).not.toContain('avatars/');

    const file = await request(app.getHttpServer())
      .get('/v1/users/profile/avatar')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(file.headers['content-type']).toMatch(/^image\/webp/);
    expect(file.headers['x-content-type-options']).toBe('nosniff');
    expect(file.headers['cache-control']).toMatch(/private/);
    expect(Buffer.from(file.body).equals(stored)).toBe(true);
  });

  it("never lets one user read another user's picture, and needs a session", async () => {
    const owner = await customer();
    const stranger = await customer();
    await post(owner.token, await photo(400, 400)).expect(201);

    // No user id exists in the route: the stranger only ever reaches their own (empty) slot.
    await request(app.getHttpServer())
      .get('/v1/users/profile/avatar')
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(404);
    expect((await me(stranger.token).expect(200)).body).not.toHaveProperty(
      'avatarVersion',
    );
    await request(app.getHttpServer())
      .get('/v1/users/profile/avatar')
      .expect(401);
    await request(app.getHttpServer())
      .post('/v1/users/profile/avatar')
      .attach('file', await photo(100, 100), 'x.jpg')
      .expect(401);
  });

  it('replaces the picture: the previous object is deleted and the version changes', async () => {
    const { user, token } = await customer();
    const first = (await post(token, await photo(500, 500)).expect(201)).body;
    const firstKey = `avatars/${user.id}/${first.avatarVersion}.webp`;
    expect(bucket.objects.has(firstKey)).toBe(true);

    const second = (await post(token, await photo(500, 400)).expect(201)).body;
    expect(second.avatarVersion).not.toBe(first.avatarVersion);
    expect(bucket.objects.has(firstKey)).toBe(false);
    expect(
      [...bucket.objects.keys()].filter((k) =>
        k.startsWith(`avatars/${user.id}/`),
      ),
    ).toEqual([`avatars/${user.id}/${second.avatarVersion}.webp`]);
  });

  it('refuses a file that is not an image, whatever its name, and a missing file', async () => {
    const { user, token } = await customer();
    await post(token, Buffer.from('<?php echo 1; ?>'), 'me.jpg').expect(400);
    await request(app.getHttpServer())
      .post('/v1/users/profile/avatar')
      .set('Authorization', `Bearer ${token}`)
      .expect(400);
    expect(
      (await prisma.user.findUniqueOrThrow({ where: { id: user.id } }))
        .avatarKey,
    ).toBeNull();
    expect(
      [...bucket.objects.keys()].some((k) =>
        k.startsWith(`avatars/${user.id}/`),
      ),
    ).toBe(false);
  });

  it('refuses a file over 5 MB', async () => {
    const { token } = await customer();
    const res = await post(token, Buffer.alloc(5 * 1024 * 1024 + 10, 1));
    expect(res.status).toBe(413);
  });

  it('removes the picture and its object; removing again is harmless', async () => {
    const { user, token } = await customer();
    const { body } = await post(token, await photo(300, 300)).expect(201);
    const key = `avatars/${user.id}/${body.avatarVersion}.webp`;

    await request(app.getHttpServer())
      .delete('/v1/users/profile/avatar')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
    expect(bucket.objects.has(key)).toBe(false);
    expect((await me(token).expect(200)).body).not.toHaveProperty(
      'avatarVersion',
    );
    await request(app.getHttpServer())
      .delete('/v1/users/profile/avatar')
      .set('Authorization', `Bearer ${token}`)
      .expect(204);
  });

  it('two uploads at once leave exactly one picture referenced and stored', async () => {
    const { user, token } = await customer();
    const [a, b] = await Promise.all([
      post(token, await photo(600, 600)),
      post(token, await photo(700, 500)),
    ]);
    const statuses = [a.status, b.status].sort();
    // Either both won one after the other (201, 201) or one lost the race (201, 409).
    expect(statuses[0]).toBe(201);
    expect([201, 409]).toContain(statuses[1]);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: user.id } });
    const stored = [...bucket.objects.keys()].filter((k) =>
      k.startsWith(`avatars/${user.id}/`),
    );
    expect(stored).toEqual([row.avatarKey]);
  });

  describe('with a browser session (cookie)', () => {
    const ORIGIN = 'http://localhost:3002';

    async function cookieSession() {
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const email = `avatar-cookie-${stamp}@example.com`;
      await prisma.user.create({
        data: {
          email,
          passwordHash: await bcrypt.hash(PASSWORD, 10),
          role: UserRole.CUSTOMER,
          status: UserStatus.ACTIVE,
          firstName: 'Cook',
          lastName: 'Ie',
          emailVerifiedAt: new Date(),
        },
      });
      const agent = request.agent(app.getHttpServer());
      const res = await agent
        .post('/v1/auth/login')
        .set('Origin', ORIGIN)
        .send({ email, password: PASSWORD })
        .expect(200);
      return { agent, csrf: res.body.csrf_token as string };
    }

    it('refuses an upload and a removal without the CSRF token, accepts them with it', async () => {
      const { agent, csrf } = await cookieSession();
      const file = await photo(300, 300);

      await agent
        .post('/v1/users/profile/avatar')
        .set('Origin', ORIGIN)
        .attach('file', file, 'me.jpg')
        .expect(403);
      await agent
        .delete('/v1/users/profile/avatar')
        .set('Origin', ORIGIN)
        .expect(403);

      await agent
        .post('/v1/users/profile/avatar')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', csrf)
        .attach('file', file, 'me.jpg')
        .expect(201);
      await agent
        .get('/v1/users/profile/avatar')
        .set('Origin', ORIGIN)
        .expect(200);
      await agent
        .delete('/v1/users/profile/avatar')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', csrf)
        .expect(204);
    });

    it('lets only a successful read be cached, never an error', async () => {
      const { agent, csrf } = await cookieSession();

      const missing = await agent
        .get('/v1/users/profile/avatar')
        .set('Origin', ORIGIN)
        .expect(404);
      expect(missing.headers['cache-control']).toBeUndefined();

      await agent
        .post('/v1/users/profile/avatar')
        .set('Origin', ORIGIN)
        .set('X-CSRF-Token', csrf)
        .attach('file', await photo(300, 300), 'me.jpg')
        .expect(201);
      const ok = await agent
        .get('/v1/users/profile/avatar')
        .set('Origin', ORIGIN)
        .expect(200);
      expect(ok.headers['cache-control']).toBe('private, max-age=86400');
    });
  });

  it('refuses an eleventh upload within a minute from the same caller', async () => {
    const { token } = await customer();
    const tiny = await photo(64, 64);
    const statuses: number[] = [];
    for (let i = 0; i < 11; i += 1) {
      statuses.push((await post(token, tiny)).status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 201 || s === 409)).toBe(
      true,
    );
    expect(statuses[10]).toBe(429);
  });
});
