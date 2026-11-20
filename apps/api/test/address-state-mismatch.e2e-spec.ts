import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { UserRole, UserStatus } from '../src/generated/prisma/enums';
import { ensureLga } from './utils/geo-fixtures';

const CUSTOMER_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'TestPassword1!';
// A state used only by this file (not the code another e2e file uses), so
// deactivating it never disturbs the shared reference rows (Lagos, ...) or a
// file running in parallel.
const STATE_CODE = 'ZM';
const STATE_NAME = 'Zeta Mismatch Test State';
// TTW-228: the second state the test needs next to Lagos. It is created here
// (active, no LGAs) instead of read from the database, so the test does not
// depend on which states and LGAs the database holds.
const OTHER_CODE = 'ZN';
const OTHER_NAME = 'Zeta Other Test State';

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
 * TTW-216: an address has one state. The stored `stateCode` identifies it and
 * `state` / `administrativeAreaLevel1` are the canonical name of that
 * GeoState, never the text the request sent. A code and a text that name two
 * different states are refused with ADDRESS_STATE_MISMATCH. A saved address
 * that already holds a mismatched pair keeps loading and stays editable.
 */
describe('Address keeps one state: the code decides the text (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    // TTW-228: the LGA needs its state, and a database with only the migrations
    // has no Lagos yet.
    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    await ensureLga(prisma);
  });

  afterAll(async () => {
    await prisma.address.deleteMany({
      where: { stateCode: { in: [STATE_CODE, OTHER_CODE] } },
    });
    await prisma.geoState.deleteMany({
      where: { code: { in: [STATE_CODE, OTHER_CODE] } },
    });
    await closeE2eApp(app);
  });

  it('stores the canonical name, refuses a contradiction, and keeps a saved mismatched row editable', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const lagos = await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    const other = await prisma.geoState.upsert({
      where: { code: OTHER_CODE },
      update: { isActive: true, name: OTHER_NAME },
      create: { code: OTHER_CODE, name: OTHER_NAME, isActive: true },
    });
    await prisma.geoState.upsert({
      where: { code: STATE_CODE },
      update: { isActive: true },
      create: { code: STATE_CODE, name: STATE_NAME, isActive: true },
    });
    const customer = await prisma.user.create({
      data: {
        email: `state-mismatch-${suffix}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'State',
        lastName: 'Mismatch',
      },
    });
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
    const post = (body: Record<string, unknown>) =>
      agent
        .post('/v1/users/addresses')
        .set('Origin', CUSTOMER_ORIGIN)
        .set('x-csrf-token', csrf)
        .send({
          addressLine1: '1 Test Road',
          city: `City ${suffix}`,
          administrativeAreaLevel2: 'Ikeja',
          country: 'Nigeria',
          ...body,
        });
    const patch = (id: string, body: Record<string, unknown>) =>
      agent
        .patch(`/v1/users/addresses/${id}`)
        .set('Origin', CUSTOMER_ORIGIN)
        .set('x-csrf-token', csrf)
        .send(body);
    const count = () =>
      prisma.address.count({ where: { userId: customer.id } });

    // Canonical name: same state in another spelling, a text that matches no
    // state, a lower-case text next to the code, a text alone (the create DTO
    // requires `state`).
    const spelled = await post({ stateCode: 'la', state: '  LAGOS ' }).expect(
      201,
    );
    expect(spelled.body).toMatchObject({
      stateCode: 'LA',
      state: lagos.name,
      administrativeAreaLevel1: lagos.name,
    });
    const unmatched = await post({
      stateCode: 'LA',
      state: 'Lagos State',
    }).expect(201);
    expect(unmatched.body).toMatchObject({
      stateCode: 'LA',
      state: lagos.name,
      administrativeAreaLevel1: lagos.name,
    });
    const codeOnly = await post({
      stateCode: other.code,
      state: other.name.toLowerCase(),
    }).expect(201);
    expect(codeOnly.body).toMatchObject({
      stateCode: other.code,
      state: other.name,
      administrativeAreaLevel1: other.name,
    });
    const textOnly = await post({ state: other.name.toUpperCase() }).expect(
      201,
    );
    expect(textOnly.body).toMatchObject({
      stateCode: other.code,
      state: other.name,
    });

    // Contradiction on create: refused, nothing stored.
    const before = await count();
    const mismatch = await post({ stateCode: 'LA', state: other.name }).expect(
      400,
    );
    expect(mismatch.body).toMatchObject({
      statusCode: 400,
      code: 'ADDRESS_STATE_MISMATCH',
    });
    const twoTexts = await post({
      state: 'Lagos',
      administrativeAreaLevel1: other.name,
    }).expect(400);
    expect(twoTexts.body).toMatchObject({ code: 'ADDRESS_STATE_MISMATCH' });
    expect(await count()).toBe(before);

    // Contradiction on edit: the saved code resent with another state's text.
    const addressId = spelled.body.id as string;
    const resent = await patch(addressId, {
      stateCode: 'LA',
      state: other.name,
    }).expect(400);
    expect(resent.body).toMatchObject({ code: 'ADDRESS_STATE_MISMATCH' });
    const moveMismatch = await patch(addressId, {
      stateCode: other.code,
      state: 'Lagos',
    }).expect(400);
    expect(moveMismatch.body).toMatchObject({
      code: 'ADDRESS_STATE_MISMATCH',
    });
    expect(
      await prisma.address.findUniqueOrThrow({ where: { id: addressId } }),
    ).toMatchObject({ stateCode: 'LA', state: lagos.name });

    // A valid move stores the canonical name of the new code.
    const moved = await patch(addressId, { stateCode: other.code }).expect(200);
    expect(moved.body).toMatchObject({
      stateCode: other.code,
      state: other.name,
      administrativeAreaLevel1: other.name,
    });

    // A deactivated code stays "unknown" (TTW-194), even with another state's
    // text, so the answer does not tell a deactivated state from a missing one.
    await prisma.geoState.update({
      where: { code: STATE_CODE },
      data: { isActive: false },
    });
    const deactivated = await post({
      stateCode: STATE_CODE,
      state: 'Lagos',
    }).expect(400);
    expect(deactivated.body).toMatchObject({ code: 'ADDRESS_STATE_UNKNOWN' });

    // Saved rows from before the rule: a pair that contradicts itself, and a
    // deactivated state. Both still load and stay editable on other fields.
    const base = {
      userId: customer.id,
      addressLine1: '2 Old Road',
      city: `Old ${suffix}`,
      country: 'Nigeria',
      countryCode: 'NG',
    };
    const legacy = await prisma.address.create({
      data: {
        ...base,
        state: other.name,
        administrativeAreaLevel1: other.name,
        stateCode: 'LA',
      },
    });
    const legacyDeactivated = await prisma.address.create({
      data: {
        ...base,
        state: STATE_NAME,
        administrativeAreaLevel1: STATE_NAME,
        stateCode: STATE_CODE,
      },
    });
    const listed = await agent
      .get('/v1/users/addresses')
      .set('Origin', CUSTOMER_ORIGIN)
      .expect(200);
    const ids = (listed.body as Array<{ id: string }>).map((a) => a.id);
    expect(ids).toEqual(
      expect.arrayContaining([legacy.id, legacyDeactivated.id]),
    );

    // The saved code decides: the edit names no state, the code stays and the
    // text becomes the canonical name of that code.
    const fixed = await patch(legacy.id, { phone: '+2348012345678' }).expect(
      200,
    );
    expect(fixed.body).toMatchObject({
      stateCode: 'LA',
      state: lagos.name,
      administrativeAreaLevel1: lagos.name,
      phone: '+2348012345678',
    });
    // A saved deactivated state keeps its code and text.
    const kept = await patch(legacyDeactivated.id, {
      phone: '+2348012345678',
    }).expect(200);
    expect(kept.body).toMatchObject({
      stateCode: STATE_CODE,
      state: STATE_NAME,
      phone: '+2348012345678',
    });
  });
});
