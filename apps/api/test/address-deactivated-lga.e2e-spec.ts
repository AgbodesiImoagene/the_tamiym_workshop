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
const STATE_CODE = 'ZV';
const STATE_NAME = 'Phi Test State';

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
 * TTW-202: an LGA an admin deactivated is no longer offered by
 * GET /v1/geo/states/:code/lgas, so a new or changed address is never linked
 * to it, while an address saved earlier keeps its LGA and stays editable.
 */
describe('Address with a deactivated LGA (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await prisma.address.deleteMany({ where: { stateCode: STATE_CODE } });
    await prisma.geoLga.deleteMany({ where: { stateCode: STATE_CODE } });
    await prisma.geoState.deleteMany({ where: { code: STATE_CODE } });
    await closeE2eApp(app);
  });

  it('does not link an address to a deactivated LGA and keeps a saved link editable', async () => {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    await prisma.geoState.upsert({
      where: { code: STATE_CODE },
      update: { isActive: true },
      create: { code: STATE_CODE, name: STATE_NAME, isActive: true },
    });
    const lgaA = await prisma.geoLga.create({
      data: { stateCode: STATE_CODE, name: `Phi A ${suffix}` },
    });
    const lgaB = await prisma.geoLga.create({
      data: { stateCode: STATE_CODE, name: `Phi B ${suffix}` },
    });
    const customer = await prisma.user.create({
      data: {
        email: `deactivated-lga-${suffix}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Deactivated',
        lastName: 'Lga',
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
          state: STATE_NAME,
          ...body,
        });
    const patch = (id: string, body: Record<string, unknown>) =>
      agent
        .patch(`/v1/users/addresses/${id}`)
        .set('Origin', CUSTOMER_ORIGIN)
        .set('x-csrf-token', csrf)
        .send(body);

    // While the LGA is active, an address is linked to it.
    const saved = await post({ lgaId: lgaA.id }).expect(201);
    expect(saved.body).toMatchObject({ stateCode: STATE_CODE, lgaId: lgaA.id });
    const savedId = saved.body.id as string;
    const other = await post({ lgaId: lgaB.id }).expect(201);

    await prisma.geoLga.updateMany({
      where: { id: { in: [lgaA.id, lgaB.id] } },
      data: { isActive: false },
    });

    // New address: never linked, by id or by name, but still saved.
    const byId = await post({ lgaId: lgaA.id }).expect(201);
    expect(byId.body.lgaId).toBeNull();
    const byName = await post({
      administrativeAreaLevel2: lgaA.name,
    }).expect(201);
    expect(byName.body.lgaId).toBeNull();

    // An edit that moves another address to the deactivated LGA does not link it.
    const moved = await patch(other.body.id as string, {
      lgaId: lgaA.id,
    }).expect(200);
    expect(moved.body.lgaId).toBeNull();

    // The address saved earlier keeps its LGA and can be edited elsewhere.
    const edited = await patch(savedId, { phone: '+2348012345678' }).expect(
      200,
    );
    expect(edited.body).toMatchObject({
      lgaId: lgaA.id,
      phone: '+2348012345678',
    });

    // The form resends the whole address, including the same LGA id and the
    // same state: the saved link is kept.
    const resent = await patch(savedId, {
      state: STATE_NAME,
      lgaId: lgaA.id,
      phone: '+2348012345679',
    }).expect(200);
    expect(resent.body).toMatchObject({
      lgaId: lgaA.id,
      stateCode: STATE_CODE,
      phone: '+2348012345679',
    });
  });
});
