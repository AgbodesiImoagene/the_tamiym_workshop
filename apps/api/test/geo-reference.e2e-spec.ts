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
 * TTW-087: customers read the states and LGAs the checkout offers, and an
 * address with a state the platform does not know is refused when it is saved.
 */
describe('Geo reference and address state (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    await prisma.geoLga.upsert({
      where: { stateCode_name: { stateCode: 'LA', name: 'Ikeja' } },
      update: { isActive: true },
      create: { stateCode: 'LA', name: 'Ikeja', isActive: true },
    });
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function loginCustomer() {
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const user = await prisma.user.create({
      data: {
        email: `geo-${suffix}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Geo',
        lastName: 'Reader',
      },
    });
    const agent = request.agent(app.getHttpServer());
    const res = await agent
      .post('/v1/auth/login')
      .set('Origin', CUSTOMER_ORIGIN)
      .send({ email: user.email, password: PASSWORD })
      .expect(200);
    const csrf =
      (res.body.csrf_token as string) ||
      cookieValue(res, 'ttw_customer_csrf') ||
      '';
    return { agent, csrf };
  }

  it('requires a signed-in user to read the states', async () => {
    await request(app.getHttpServer())
      .get('/v1/geo/states')
      .set('Origin', CUSTOMER_ORIGIN)
      .expect(401);
  });

  it('lists active states as code and name only, sorted by name', async () => {
    const { agent } = await loginCustomer();
    const res = await agent
      .get('/v1/geo/states')
      .set('Origin', CUSTOMER_ORIGIN)
      .expect(200);
    const states = res.body as Array<Record<string, unknown>>;
    expect(states).toEqual(
      expect.arrayContaining([{ code: 'LA', name: 'Lagos' }]),
    );
    expect(Object.keys(states[0]).sort()).toEqual(['code', 'name']);
    const names = states.map((s) => s.name as string);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('lists the LGAs of a state as id and name only', async () => {
    const { agent } = await loginCustomer();
    const res = await agent
      .get('/v1/geo/states/LA/lgas')
      .set('Origin', CUSTOMER_ORIGIN)
      .expect(200);
    const lgas = res.body as Array<Record<string, unknown>>;
    expect(lgas.map((l) => l.name)).toContain('Ikeja');
    expect(Object.keys(lgas[0]).sort()).toEqual(['id', 'name']);
  });

  it('answers 404 GEO_STATE_NOT_FOUND for an unknown state code', async () => {
    const { agent } = await loginCustomer();
    const res = await agent
      .get('/v1/geo/states/ZZ/lgas')
      .set('Origin', CUSTOMER_ORIGIN)
      .expect(404);
    expect(res.body).toMatchObject({ code: 'GEO_STATE_NOT_FOUND' });
  });

  it('refuses to save an address whose state is unknown, and saves nothing', async () => {
    const { agent, csrf } = await loginCustomer();
    const res = await agent
      .post('/v1/users/addresses')
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send({
        addressLine1: '12 Broad Street',
        city: 'Lagos',
        state: 'Lagoss',
        country: 'Nigeria',
      })
      .expect(400);
    expect(res.body).toMatchObject({ code: 'ADDRESS_STATE_UNKNOWN' });
    const list = await agent
      .get('/v1/users/addresses')
      .set('Origin', CUSTOMER_ORIGIN)
      .expect(200);
    expect(list.body).toEqual([]);
  });

  it('saves an address with a listed state and resolves its code', async () => {
    const { agent, csrf } = await loginCustomer();
    const res = await agent
      .post('/v1/users/addresses')
      .set('Origin', CUSTOMER_ORIGIN)
      .set('x-csrf-token', csrf)
      .send({
        addressLine1: '12 Broad Street',
        city: 'Ikeja',
        state: 'Lagos',
        stateCode: 'LA',
        country: 'Nigeria',
      })
      .expect(201);
    expect(res.body).toMatchObject({ state: 'Lagos', stateCode: 'LA' });
  });
});
