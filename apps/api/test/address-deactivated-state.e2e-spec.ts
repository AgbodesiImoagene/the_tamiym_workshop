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
// shared reference rows (Lagos, ...) other e2e files rely on.
const STATE_CODE = 'ZT';
const STATE_NAME = 'Zeta Test State';

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
 * TTW-194: a state an admin deactivated is no longer offered by
 * GET /v1/geo/states, so the address routes must refuse it too (by name and by
 * code), while an address saved earlier with that state still loads and can be
 * edited on other fields.
 */
describe('Address with a deactivated state (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    // Leave the shared reference data as it was found.
    await prisma.address.deleteMany({ where: { stateCode: STATE_CODE } });
    await prisma.geoState.deleteMany({ where: { code: STATE_CODE } });
    await closeE2eApp(app);
  });

  it('refuses a deactivated state on create and on a state change, and keeps a saved one editable', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await prisma.geoState.upsert({
      where: { code: STATE_CODE },
      update: { isActive: true },
      create: { code: STATE_CODE, name: STATE_NAME, isActive: true },
    });
    const customer = await prisma.user.create({
      data: {
        email: `deactivated-state-${suffix}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Deactivated',
        lastName: 'State',
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
          country: 'Nigeria',
          ...body,
        });
    const patch = (id: string, body: Record<string, unknown>) =>
      agent
        .patch(`/v1/users/addresses/${id}`)
        .set('Origin', CUSTOMER_ORIGIN)
        .set('x-csrf-token', csrf)
        .send(body);

    // While the state is active, it is accepted and saved with its code.
    const created = await post({ state: STATE_NAME }).expect(201);
    expect(created.body).toMatchObject({ stateCode: STATE_CODE });
    const addressId = created.body.id as string;
    // A second address on another active state, to move away from.
    const lagos = await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    const other = await post({ state: lagos.name }).expect(201);

    await prisma.geoState.update({
      where: { code: STATE_CODE },
      data: { isActive: false },
    });

    const before = await prisma.address.count({
      where: { userId: customer.id },
    });

    // New address: refused by name and by code.
    const byName = await post({ state: STATE_NAME }).expect(400);
    expect(byName.body).toMatchObject({ code: 'ADDRESS_STATE_UNKNOWN' });
    const byCode = await post({
      state: STATE_NAME,
      stateCode: STATE_CODE,
    }).expect(400);
    expect(byCode.body).toMatchObject({ code: 'ADDRESS_STATE_UNKNOWN' });

    expect(await prisma.address.count({ where: { userId: customer.id } })).toBe(
      before,
    );

    // An edit that moves another address to the deactivated state is refused.
    const moved = await patch(other.body.id as string, {
      state: STATE_NAME,
    }).expect(400);
    expect(moved.body).toMatchObject({ code: 'ADDRESS_STATE_UNKNOWN' });
    const movedByCode = await patch(other.body.id as string, {
      stateCode: STATE_CODE,
    }).expect(400);
    expect(movedByCode.body).toMatchObject({ code: 'ADDRESS_STATE_UNKNOWN' });
    const stillLagos = await prisma.address.findUniqueOrThrow({
      where: { id: other.body.id as string },
    });
    expect(stillLagos).toMatchObject({ state: 'Lagos', stateCode: 'LA' });

    // The address saved earlier still loads and can be edited on other
    // fields, including when the form resends the same state.
    const listed = await agent
      .get('/v1/users/addresses')
      .set('Origin', CUSTOMER_ORIGIN)
      .expect(200);
    expect(
      (listed.body as Array<{ id: string }>).some((a) => a.id === addressId),
    ).toBe(true);
    const edited = await patch(addressId, {
      phone: '+2348012345678',
      state: STATE_NAME,
    }).expect(200);
    expect(edited.body).toMatchObject({
      state: STATE_NAME,
      stateCode: STATE_CODE,
      phone: '+2348012345678',
    });
  });
});
