import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { generateTotpCode } from '../src/auth/admin-mfa.totp';
import { AuthService, isMfaChallengeResponse } from '../src/auth/auth.service';
import {
  AuthSurface,
  ShippingRuleMatchType,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';
import { ensureLga } from './utils/geo-fixtures';

const CUSTOMER_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'TestPassword1!';
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
 * TTW-226: (1) admin shipping rules read the country code like an address;
 * (2) an address moved out of Nigeria loses its Nigerian state code and LGA;
 * (3) over-long texts and NUL characters answer 400, never 500.
 */
describe('Country code and text hardening (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let userId: string;
  let adminId: string;
  let adminAuth: string;
  let zoneId: string;
  let ikejaId: string;
  let post: (body: Record<string, unknown>) => request.Test;
  let patch: (id: string, body: Record<string, unknown>) => request.Test;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    const authService = app.get(AuthService);
    const ikeja = await ensureLga(prisma);
    ikejaId = ikeja.id;
    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

    const customer = await prisma.user.create({
      data: {
        email: `harden-${suffix}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Harden',
        lastName: 'Customer',
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
          administrativeAreaLevel2: 'Ikeja',
          country: 'Nigeria',
          ...body,
        });
    patch = (id, body) =>
      agent
        .patch(`/v1/users/addresses/${id}`)
        .set('Origin', CUSTOMER_ORIGIN)
        .set('x-csrf-token', csrf)
        .send(body);

    const adminEmail = `harden-admin-${suffix}@example.com`;
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        firstName: 'Harden',
        lastName: 'Admin',
        emailVerifiedAt: new Date(),
      },
    });
    adminId = admin.id;
    const challenge = await authService.login(
      { email: adminEmail, password: PASSWORD },
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
    adminAuth = `Bearer ${session.access_token}`;
    zoneId = (
      await prisma.shippingZone.create({
        data: { name: `Harden zone ${suffix}` },
      })
    ).id;
  });

  beforeEach(async () => {
    await prisma.address.deleteMany({ where: { userId } });
    await prisma.shippingZoneRule.deleteMany({ where: { zoneId } });
  });

  afterAll(async () => {
    await prisma.address.deleteMany({ where: { userId } });
    await prisma.shippingZoneRule.deleteMany({ where: { zoneId } });
    await prisma.shippingZone.delete({ where: { id: zoneId } });
    await prisma.authSession.deleteMany({ where: { userId: adminId } });
    await prisma.user.delete({ where: { id: adminId } });
    await closeE2eApp(app);
  });

  describe('admin shipping rules', () => {
    const rulePath = () => `/v1/admin/shipping-zones/${zoneId}/rules`;
    const createRule = (body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .post(rulePath())
        .set('Authorization', adminAuth)
        .send(body);

    it('stores a full-width NG as NG, so the rule matches', async () => {
      const res = await createRule({
        countryCode: FULL_WIDTH_NG,
        matchType: ShippingRuleMatchType.ADMIN1,
        matchValue: 'LA',
      }).expect(201);
      expect(res.body.countryCode).toBe('NG');
      expect(res.body.matchValue).toBe('LA');
    });

    it.each(['XX', 'N1', 'ıt', 'ＮＧＧ'])(
      'refuses %j with 400 and stores nothing',
      async (countryCode) => {
        await createRule({
          countryCode,
          matchType: ShippingRuleMatchType.ADMIN1,
          matchValue: 'LA',
        }).expect(400);
        expect(await prisma.shippingZoneRule.count({ where: { zoneId } })).toBe(
          0,
        );
      },
    );

    it('refuses an update that sets a bad code, and edits a legacy rule on other fields', async () => {
      const legacy = await prisma.shippingZoneRule.create({
        data: {
          zoneId,
          countryCode: 'XX',
          matchType: ShippingRuleMatchType.ADMIN1,
          matchValue: 'Somewhere',
          priority: 100,
        },
      });
      await request(app.getHttpServer())
        .patch(`/v1/admin/shipping-rules/${legacy.id}`)
        .set('Authorization', adminAuth)
        .send({ countryCode: 'YY' })
        .expect(400);
      const edited = await request(app.getHttpServer())
        .patch(`/v1/admin/shipping-rules/${legacy.id}`)
        .set('Authorization', adminAuth)
        .send({ priority: 7 })
        .expect(200);
      expect(edited.body).toMatchObject({ countryCode: 'XX', priority: 7 });
    });
  });

  describe('an address moved out of Nigeria', () => {
    it('loses its Nigerian state code and LGA when only the country changes', async () => {
      const created = await post({}).expect(201);
      expect(created.body).toMatchObject({ stateCode: 'LA', lgaId: ikejaId });

      const moved = await patch(created.body.id, {
        countryCode: 'GH',
        country: 'Ghana',
      }).expect(200);
      expect(moved.body).toMatchObject({
        countryCode: 'GH',
        stateCode: null,
        lgaId: null,
      });
      const row = await prisma.address.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(row).toMatchObject({
        countryCode: 'GH',
        stateCode: null,
        lgaId: null,
      });
    });

    it('keeps the state text the customer sent', async () => {
      const created = await post({}).expect(201);
      const moved = await patch(created.body.id, {
        countryCode: 'GH',
        country: 'Ghana',
        state: 'Greater Accra',
        city: 'Accra',
        stateCode: 'LA',
        lgaId: ikejaId,
      }).expect(200);
      expect(moved.body).toMatchObject({
        state: 'Greater Accra',
        stateCode: null,
        lgaId: null,
      });
    });

    it('applies the Nigerian rules again when it moves back to NG', async () => {
      const created = await post({}).expect(201);
      await patch(created.body.id, {
        countryCode: 'GH',
        country: 'Ghana',
        state: 'Greater Accra',
      }).expect(200);
      await patch(created.body.id, {
        countryCode: 'NG',
        country: 'Nigeria',
        state: 'Nowhereland',
      }).expect(400);
      const back = await patch(created.body.id, {
        countryCode: 'NG',
        country: 'Nigeria',
        state: 'Lagos',
        administrativeAreaLevel2: 'Ikeja',
      }).expect(200);
      expect(back.body).toMatchObject({ stateCode: 'LA', lgaId: ikejaId });
    });
  });

  describe('state and other texts', () => {
    it.each(['state', 'administrativeAreaLevel1', 'city', 'addressLine1'])(
      'create refuses an over-long %s with 400',
      async (field) => {
        await post({ [field]: 'a'.repeat(501) }).expect(400);
      },
    );

    it.each([
      ['state', 'Lag\u0000os'],
      ['administrativeAreaLevel1', 'Lag\u0000os'],
      ['city', 'Ike\u0000ja'],
      ['landmark', 'x\u0000y'],
      ['instructions', 'x\u0000y'],
    ])('create refuses a NUL in %s with 400, not 500', async (field, value) => {
      await post({ [field]: value }).expect(400);
      expect(await prisma.address.count({ where: { userId } })).toBe(0);
    });

    it('update refuses an over-long state and a NUL, and leaves the address as saved', async () => {
      const created = await post({}).expect(201);
      await patch(created.body.id, { state: 'a'.repeat(501) }).expect(400);
      await patch(created.body.id, { state: 'Lag\u0000os' }).expect(400);
      await patch(created.body.id, { city: 'Ike\u0000ja' }).expect(400);
      const row = await prisma.address.findUniqueOrThrow({
        where: { id: created.body.id },
      });
      expect(row).toMatchObject({ state: 'Lagos', city: 'Ikeja' });
    });

    it('still accepts a Nigerian address with ordinary texts', async () => {
      const res = await post({
        addressLine2: 'Apt 4B',
        landmark: "Near St. Mary's",
        postalCode: '100001',
      }).expect(201);
      expect(res.body).toMatchObject({ stateCode: 'LA', lgaId: ikejaId });
    });
  });
});
