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
// Full-width "NG" (U+FF2E U+FF27): two characters, so `@Length(2, 2)` lets it in.
const FULL_WIDTH_NG = 'ＮＧ';

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
 * TTW-219: (1) a refused address save must not clear the customer's default
 * address; (2) a country code written in another form (full-width letters,
 * lower case, spaces) must not skip the Nigerian state checks.
 */
describe('Address default and country code (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userId: string;
  let post: (body: Record<string, unknown>) => request.Test;
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
        email: `default-country-${suffix}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Default',
        lastName: 'Country',
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

  describe('a refused save keeps the default address', () => {
    it('create with isDefault and an unknown state: the old default stays', async () => {
      const first = await post({}).expect(201);
      expect(first.body.isDefault).toBe(true);

      const refused = await post({
        isDefault: true,
        state: 'Nowhereland',
      }).expect(400);
      expect(refused.body).toMatchObject({ code: 'ADDRESS_STATE_UNKNOWN' });

      expect(await defaults()).toEqual([first.body.id]);
      expect(await prisma.address.count({ where: { userId } })).toBe(1);
    });

    it('edit with isDefault and an unknown state: the old default stays', async () => {
      const first = await post({}).expect(201);
      const second = await post({ isDefault: false }).expect(201);
      expect(second.body.isDefault).toBe(false);

      const refused = await patch(second.body.id as string, {
        isDefault: true,
        state: 'Nowhereland',
      }).expect(400);
      expect(refused.body).toMatchObject({ code: 'ADDRESS_STATE_UNKNOWN' });

      expect(await defaults()).toEqual([first.body.id]);
    });

    it('edit with isDefault and a bad country code: the old default stays', async () => {
      const first = await post({}).expect(201);
      const second = await post({ isDefault: false }).expect(201);

      await patch(second.body.id as string, {
        isDefault: true,
        countryCode: 'XX',
      }).expect(400);

      expect(await defaults()).toEqual([first.body.id]);
    });

    it('a successful save still moves the default', async () => {
      const first = await post({}).expect(201);
      const second = await post({ isDefault: true }).expect(201);
      expect(await defaults()).toEqual([second.body.id]);

      await patch(first.body.id as string, { isDefault: true }).expect(200);
      expect(await defaults()).toEqual([first.body.id]);
    });

    it('the first address still becomes the default', async () => {
      const first = await post({}).expect(201);
      expect(first.body.isDefault).toBe(true);
      const second = await post({}).expect(201);
      expect(second.body.isDefault).toBe(false);
    });

    it('quick saves of several default addresses leave exactly one default', async () => {
      await post({}).expect(201);
      const results = await Promise.all(
        Array.from({ length: 6 }, () => post({ isDefault: true })),
      );
      expect(results.map((r) => r.status)).toEqual(Array(6).fill(201));
      expect(await defaults()).toHaveLength(1);
      expect(await prisma.address.count({ where: { userId } })).toBe(7);
    });
  });

  /**
   * The write of the address itself fails AFTER the old default was cleared. The
   * failure is real: a database trigger (created by this file, dropped after) rejects
   * a row whose street line is the marker. Without the transaction the old default
   * would stay cleared.
   */
  describe('a failed write rolls the cleared default back (real Postgres)', () => {
    const FAIL_MARKER = 'TTW219-FORCE-DB-FAILURE';

    beforeAll(async () => {
      await prisma.$executeRawUnsafe(`
        CREATE OR REPLACE FUNCTION ttw219_fail_marker() RETURNS trigger AS $$
        BEGIN
          IF NEW."addressLine1" = '${FAIL_MARKER}' THEN
            RAISE EXCEPTION 'ttw219 forced failure';
          END IF;
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql`);
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS ttw219_fail_marker ON addresses',
      );
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER ttw219_fail_marker BEFORE INSERT OR UPDATE ON addresses
        FOR EACH ROW EXECUTE FUNCTION ttw219_fail_marker()`);
    });

    afterAll(async () => {
      await prisma.$executeRawUnsafe(
        'DROP TRIGGER IF EXISTS ttw219_fail_marker ON addresses',
      );
      await prisma.$executeRawUnsafe(
        'DROP FUNCTION IF EXISTS ttw219_fail_marker()',
      );
    });

    const snapshot = () =>
      prisma.address.findMany({
        where: { userId },
        orderBy: { id: 'asc' },
      });

    it('create: the old default is still the default and nothing is created', async () => {
      const first = await post({}).expect(201);
      const before = await snapshot();

      await post({ isDefault: true, addressLine1: FAIL_MARKER }).expect(500);

      expect(await defaults()).toEqual([first.body.id]);
      expect(await snapshot()).toEqual(before);
    });

    it('edit: the old default is still the default and nothing is modified', async () => {
      const first = await post({}).expect(201);
      const second = await post({ isDefault: false }).expect(201);
      const before = await snapshot();

      await patch(second.body.id as string, {
        isDefault: true,
        addressLine1: FAIL_MARKER,
      }).expect(500);

      expect(await defaults()).toEqual([first.body.id]);
      expect(await snapshot()).toEqual(before);
    });
  });

  describe('a country code cannot skip the state checks', () => {
    it('full-width code with an unknown state is refused on create and edit', async () => {
      const refused = await post({
        countryCode: FULL_WIDTH_NG,
        state: 'Nowhereland',
      }).expect(400);
      expect(refused.body).toMatchObject({ code: 'ADDRESS_STATE_UNKNOWN' });

      const saved = await post({}).expect(201);
      const refusedEdit = await patch(saved.body.id as string, {
        countryCode: FULL_WIDTH_NG,
        state: 'Nowhereland',
      }).expect(400);
      expect(refusedEdit.body).toMatchObject({ code: 'ADDRESS_STATE_UNKNOWN' });
      expect(await prisma.address.count({ where: { userId } })).toBe(1);
    });

    it('full-width code with a deactivated state is refused', async () => {
      await prisma.geoState.update({
        where: { code: STATE_CODE },
        data: { isActive: false },
      });
      try {
        const refused = await post({
          countryCode: FULL_WIDTH_NG,
          state: STATE_NAME,
        }).expect(400);
        expect(refused.body).toMatchObject({ code: 'ADDRESS_STATE_UNKNOWN' });
      } finally {
        await prisma.geoState.update({
          where: { code: STATE_CODE },
          data: { isActive: true },
        });
      }
    });

    it('full-width and mixed-case codes are saved as NG', async () => {
      for (const countryCode of [FULL_WIDTH_NG, 'ng', 'Ng']) {
        const saved = await post({ countryCode, isDefault: false }).expect(201);
        expect(saved.body).toMatchObject({
          countryCode: 'NG',
          stateCode: 'LA',
        });
      }
    });

    it('refuses a code that is not an ISO 3166 two-letter code', async () => {
      for (const countryCode of ['XX', 'N1', '  ', '', 'NGA', 'Ｎ']) {
        const res = await post({ countryCode }).expect(400);
        expect(JSON.stringify(res.body)).toMatch(/country/i);
      }
      expect(await prisma.address.count({ where: { userId } })).toBe(0);
    });

    it('keeps a valid non-Nigerian code working', async () => {
      const saved = await post({
        countryCode: 'gh',
        country: 'Ghana',
        state: 'Greater Accra',
        city: 'Accra',
      }).expect(201);
      expect(saved.body).toMatchObject({ countryCode: 'GH', stateCode: null });
    });
  });
});
