import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole, UserStatus } from '../src/generated/prisma/enums';

const CUSTOMER_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'TestPassword1!';
// A state used only by this file, so deactivating it never disturbs the
// shared reference rows other e2e files rely on.
const STATE_CODE = 'ZD';
const STATE_NAME = 'Delta Default Test State';

function cookieValue(res: Response, name: string): string | undefined {
  const setCookie = res.headers['set-cookie'];
  const cookies: string[] = Array.isArray(setCookie)
    ? setCookie
    : setCookie
      ? [setCookie]
      : [];
  for (const raw of cookies) {
    const [pair] = raw.split(';');
    const [key, value] = pair.split('=');
    if (key === name) return decodeURIComponent(value ?? '');
  }
  return undefined;
}

/**
 * TTW-222: one default address per customer, enforced by the database; delete
 * is atomic; an edit of an address deleted in parallel is a 404.
 */
describe('One default address per customer (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userId: string;
  let post: (body: Record<string, unknown>) => request.Test;
  let del: (id: string) => request.Test;
  let patch: (id: string, body: Record<string, unknown>) => request.Test;

  const defaults = async () =>
    (
      await prisma.address.findMany({
        where: { userId, isDefault: true },
        select: { id: true },
      })
    ).map((a) => a.id);

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    await prisma.geoState.upsert({
      where: { code: STATE_CODE },
      update: { isActive: true },
      create: { code: STATE_CODE, name: STATE_NAME, isActive: true },
    });
    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const customer = await prisma.user.create({
      data: {
        email: `one-default-${suffix}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Only',
        lastName: 'One',
      },
    });
    userId = customer.id;
    const agent = request.agent(app.getHttpServer());
    const login = await agent
      .post('/v1/auth/login')
      .set('Origin', CUSTOMER_ORIGIN)
      .send({ email: customer.email, password: PASSWORD })
      .expect(200);
    const csrf =
      (login.body.csrf_token as string) ||
      cookieValue(login, 'ttw_customer_csrf') ||
      '';
    post = (body) =>
      agent
        .post('/v1/users/addresses')
        .set('Origin', CUSTOMER_ORIGIN)
        .set('x-csrf-token', csrf)
        .send({
          addressLine1: '1 Test Road',
          city: 'Ikeja',
          state: 'Lagos',
          country: 'Nigeria',
          ...body,
        });
    del = (id) =>
      agent
        .delete(`/v1/users/addresses/${id}`)
        .set('Origin', CUSTOMER_ORIGIN)
        .set('x-csrf-token', csrf);
    patch = (id, body) =>
      agent
        .patch(`/v1/users/addresses/${id}`)
        .set('Origin', CUSTOMER_ORIGIN)
        .set('x-csrf-token', csrf)
        .send(body);
  });

  beforeEach(async () => {
    await prisma.address.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await prisma.address.deleteMany({ where: { userId } });
    await prisma.geoState.deleteMany({ where: { code: STATE_CODE } });
    await closeE2eApp(app);
  });

  describe('the database refuses a second default address', () => {
    it('a second default for the same user is rejected', async () => {
      await post({}).expect(201);
      const row = {
        addressLine1: '2 Direct Road',
        city: 'Ikeja',
        state: 'Lagos',
        isDefault: true,
      };
      await expect(
        prisma.address.create({ data: { ...row, userId } }),
      ).rejects.toMatchObject({ code: 'P2002' });
      // Setting a second default by an update is refused too.
      const other = await post({ isDefault: false }).expect(201);
      await expect(
        prisma.address.update({
          where: { id: other.body.id as string },
          data: { isDefault: true },
        }),
      ).rejects.toMatchObject({ code: 'P2002' });
      expect(await defaults()).toHaveLength(1);
    });

    it('two different users can each have a default address', async () => {
      await post({}).expect(201);
      const other = await prisma.user.create({
        data: {
          email: `one-default-other-${Date.now()}@example.com`,
          passwordHash: 'x',
          role: UserRole.CUSTOMER,
          status: UserStatus.ACTIVE,
          firstName: 'Other',
          lastName: 'User',
        },
      });
      try {
        await prisma.address.create({
          data: {
            userId: other.id,
            addressLine1: '3 Other Road',
            city: 'Ikeja',
            state: 'Lagos',
            isDefault: true,
          },
        });
        expect(await defaults()).toHaveLength(1);
      } finally {
        await prisma.user.delete({ where: { id: other.id } });
      }
    });

    it('many non-default addresses are allowed', async () => {
      await post({}).expect(201);
      await post({ isDefault: false }).expect(201);
      await post({ isDefault: false }).expect(201);
      expect(await prisma.address.count({ where: { userId } })).toBe(3);
    });

    it('parallel saves with isDefault: true leave exactly one default', async () => {
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, i) =>
          post({ isDefault: true, addressLine1: `${i} Parallel Road` }),
        ),
      );
      expect(results.map((r) => r.status)).toEqual(Array(6).fill(201));
      expect(await defaults()).toHaveLength(1);
    });
  });

  describe('deleting an address', () => {
    const FAIL_MARKER = 'TTW222-FORCE-DB-FAILURE';

    beforeAll(async () => {
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION ttw222_fail_marker() RETURNS trigger AS $$
        BEGIN
          IF NEW."addressLine1" = '${FAIL_MARKER}' AND NEW."isDefault" THEN
            RAISE EXCEPTION 'ttw222 forced failure';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS ttw222_fail_marker ON addresses',
      );
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER ttw222_fail_marker BEFORE UPDATE ON addresses
        FOR EACH ROW EXECUTE FUNCTION ttw222_fail_marker()`);
    });

    afterAll(async () => {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS ttw222_fail_marker ON addresses',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS ttw222_fail_marker()',
      );
    });

    it('promotes exactly the most recent other address', async () => {
      const first = await post({}).expect(201);
      const second = await post({ isDefault: false }).expect(201);
      const third = await post({ isDefault: false }).expect(201);
      await del(first.body.id as string).expect(204);
      expect(await defaults()).toEqual([third.body.id]);
      expect(second.body.id).not.toBe(third.body.id);
    });

    it('deleting a non-default address keeps the default', async () => {
      const first = await post({}).expect(201);
      const second = await post({ isDefault: false }).expect(201);
      await del(second.body.id as string).expect(204);
      expect(await defaults()).toEqual([first.body.id]);
    });

    it('deleting the only address leaves no default and no error', async () => {
      const first = await post({}).expect(201);
      await del(first.body.id as string).expect(204);
      expect(await defaults()).toEqual([]);
    });

    it('a failure while promoting rolls the delete back', async () => {
      const first = await post({}).expect(201);
      await post({ isDefault: false, addressLine1: FAIL_MARKER }).expect(201);
      // Only promoting this row to default (an UPDATE) is made to fail.
      const before = await prisma.address.findMany({
        where: { userId },
        orderBy: { id: 'asc' },
      });

      await del(first.body.id as string).expect(500);

      expect(await defaults()).toEqual([first.body.id]);
      expect(
        await prisma.address.findMany({
          where: { userId },
          orderBy: { id: 'asc' },
        }),
      ).toEqual(before);
    });

    it('two parallel deletes of the same address: one 204, one 404, one default left', async () => {
      const first = await post({}).expect(201);
      const second = await post({ isDefault: false }).expect(201);
      const results = await Promise.all([
        del(first.body.id as string),
        del(first.body.id as string),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([204, 404]);
      expect(await defaults()).toEqual([second.body.id]);
    });
  });

  describe('an edit of an address deleted in parallel', () => {
    it('returns 404, not 500', async () => {
      const first = await post({}).expect(201);
      let release!: () => void;
      let locked!: () => void;
      const gate = new Promise<void>((r) => (release = r));
      const lockTaken = new Promise<void>((r) => (locked = r));
      // Hold the user's lock, as a delete in progress would.
      const holder = prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT id FROM users WHERE id = ${userId} FOR NO KEY UPDATE`;
        locked();
        await gate;
        await tx.address.delete({ where: { id: first.body.id as string } });
      });
      await lockTaken;
      // The edit reads the address, then waits for the lock.
      const edit = patch(first.body.id as string, { city: 'Lekki' }).then(
        (r) => r,
      );
      await new Promise((r) => setTimeout(r, 800));
      release();
      await holder;
      const res = await edit;
      expect(res.status).toBe(404);
      expect(await prisma.address.count({ where: { userId } })).toBe(0);
    });
  });
});
