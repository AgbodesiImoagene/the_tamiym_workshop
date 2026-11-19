import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { PrismaService } from '../src/prisma/prisma.service';
import { ensureLga } from './utils/geo-fixtures';
import {
  OrderStatus,
  PaymentStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

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
 * TTW-227: deleting an address that an order uses answers 409 (it was a 500),
 * and a country name sent without a code stores the matching code.
 */
describe('Used address delete and country name (e2e)', () => {
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

  const orderUsing = (shippingAddressId: string) =>
    prisma.order.create({
      data: {
        userId,
        shippingAddressId,
        status: OrderStatus.PENDING_PAYMENT,
        paymentStatus: PaymentStatus.PENDING,
        currency: 'NGN',
        subtotalAmount: 1000,
        totalAmount: 1000,
        shipLine1: '1 Test Road',
        shipCity: 'Ikeja',
        shipState: 'Lagos',
        shipCountry: 'Nigeria',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    await prisma.geoState.upsert({
      where: { code: 'LA' },
      update: { isActive: true },
      create: { code: 'LA', name: 'Lagos', isActive: true },
    });
    // TTW-221: a Lagos address must carry an LGA.
    await ensureLga(prisma);
    const suffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
    const customer = await prisma.user.create({
      data: {
        email: `used-address-${suffix}@example.com`,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Used',
        lastName: 'Address',
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
    await prisma.order.deleteMany({ where: { userId } });
    await prisma.address.deleteMany({ where: { userId } });
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { userId } });
    await prisma.address.deleteMany({ where: { userId } });
    await closeE2eApp(app);
  });

  describe('deleting an address that an order uses', () => {
    it('answers 409 with a stable code and changes nothing', async () => {
      const first = (await post({}).expect(201)).body as { id: string };
      const second = (
        await post({ addressLine1: '2 Other Road', isDefault: true }).expect(
          201,
        )
      ).body as { id: string };
      const order = await orderUsing(second.id);

      const res = await del(second.id);

      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({
        statusCode: 409,
        code: 'ADDRESS_IN_USE',
        message: 'This address is used by an order and cannot be deleted.',
      });
      // The address and the order are untouched; the default did not move.
      expect(
        await prisma.address.findUnique({ where: { id: second.id } }),
      ).not.toBeNull();
      expect(
        (await prisma.order.findUnique({ where: { id: order.id } }))
          ?.shippingAddressId,
      ).toBe(second.id);
      expect(await defaults()).toEqual([second.id]);
      expect(first.id).not.toBe(second.id);
    });

    it('still deletes an address no order uses and promotes the most recent one', async () => {
      const used = (await post({}).expect(201)).body as { id: string };
      const spare = (
        await post({ addressLine1: '3 Spare Road', isDefault: true }).expect(
          201,
        )
      ).body as { id: string };
      await orderUsing(used.id);

      await del(spare.id).expect(204);

      expect(await defaults()).toEqual([used.id]);
    });
  });

  describe('a country name sent without a country code', () => {
    it('create stores the matching code', async () => {
      const created = await post({
        state: 'Greater Accra',
        administrativeAreaLevel2: undefined,
        city: 'Accra',
        country: 'Ghana',
      }).expect(201);
      expect(created.body).toMatchObject({
        country: 'Ghana',
        countryCode: 'GH',
        stateCode: null,
        lgaId: null,
      });
    });

    it('an edit that sends only the country name moves the address out of Nigeria', async () => {
      const created = (await post({}).expect(201)).body as {
        id: string;
        countryCode: string;
        stateCode: string | null;
      };
      expect(created).toMatchObject({ countryCode: 'NG', stateCode: 'LA' });

      const edited = await patch(created.id, {
        country: 'Ghana',
        state: 'Greater Accra',
      }).expect(200);
      expect(edited.body).toMatchObject({
        country: 'Ghana',
        countryCode: 'GH',
        stateCode: null,
        lgaId: null,
      });
    });

    it('an explicit code still wins over the name', async () => {
      const created = await post({
        country: 'Ghana',
        countryCode: 'NG',
      }).expect(201);
      expect(created.body).toMatchObject({ countryCode: 'NG' });
    });
  });
});
