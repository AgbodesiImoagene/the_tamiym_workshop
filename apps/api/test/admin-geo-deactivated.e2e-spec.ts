import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { generateTotpCode } from '../src/auth/admin-mfa.totp';
import { AuthService, isMfaChallengeResponse } from '../src/auth/auth.service';
import {
  AuthSurface,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';

const CUSTOMER_ORIGIN = 'http://localhost:3000';
const PASSWORD = 'TestPassword1!';

interface AdminState {
  code: string;
  name: string;
  isActive: boolean;
}
interface AdminLga {
  id: string;
  name: string;
  isActive: boolean;
}

/**
 * TTW-199: an admin still sees a deactivated state (and deactivated LGAs) in
 * the shipping geo lists, flagged with isActive: false. The customer-facing
 * lists keep hiding them.
 */
describe('Admin geo lists keep deactivated rows (e2e)', () => {
  const suffix = `${Date.now()}`;
  const stateCode = `T${suffix.slice(-5)}`;
  const stateName = `Ttw199 Closed ${suffix}`;
  const openCode = `U${suffix.slice(-5)}`;
  const openName = `Ttw199 Open ${suffix}`;

  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminAuth: string;
  let adminId: string;
  let customerId: string;
  let customerEmail: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    const authService = app.get(AuthService);

    const email = `geo-admin-${suffix}@example.com`;
    const admin = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        firstName: 'Geo',
        lastName: 'Admin',
        emailVerifiedAt: new Date(),
      },
    });
    adminId = admin.id;
    const challenge = await authService.login(
      { email, password: PASSWORD },
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

    customerEmail = `geo-cust-${suffix}@example.com`;
    const customer = await prisma.user.create({
      data: {
        email: customerEmail,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Geo',
        lastName: 'Customer',
      },
    });
    customerId = customer.id;

    await prisma.geoState.create({
      data: { code: stateCode, name: stateName, isActive: false },
    });
    await prisma.geoState.create({
      data: { code: openCode, name: openName, isActive: true },
    });
    await prisma.geoLga.createMany({
      data: [
        { stateCode, name: 'Closed One', isActive: true },
        { stateCode, name: 'Closed Two', isActive: false },
      ],
    });
  });

  afterAll(async () => {
    await prisma.geoState.deleteMany({
      where: { code: { in: [stateCode, openCode] } },
    });
    await prisma.authSession.deleteMany({
      where: { userId: { in: [adminId, customerId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [adminId, customerId] } },
    });
    await closeE2eApp(app);
  });

  it('lists a deactivated state to the admin, flagged isActive: false', async () => {
    const res = await request(app.getHttpServer())
      .get('/v1/admin/geo/states')
      .set('Authorization', adminAuth)
      .expect(200);
    const states = res.body as AdminState[];
    expect(states.find((s) => s.code === stateCode)).toMatchObject({
      name: stateName,
      isActive: false,
    });
    expect(states.find((s) => s.code === openCode)).toMatchObject({
      isActive: true,
    });
  });

  it('lists the LGAs of a deactivated state, including deactivated ones', async () => {
    const res = await request(app.getHttpServer())
      .get(`/v1/admin/geo/states/${stateCode}/lgas`)
      .set('Authorization', adminAuth)
      .expect(200);
    const lgas = res.body as AdminLga[];
    expect(lgas.map((l) => [l.name, l.isActive])).toEqual([
      ['Closed One', true],
      ['Closed Two', false],
    ]);
  });

  it('keeps the admin routes closed to a request without a session', async () => {
    await request(app.getHttpServer()).get('/v1/admin/geo/states').expect(401);
    await request(app.getHttpServer())
      .get(`/v1/admin/geo/states/${stateCode}/lgas`)
      .expect(401);
  });

  it('keeps hiding the deactivated state and its LGAs from customers', async () => {
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/v1/auth/login')
      .set('Origin', CUSTOMER_ORIGIN)
      .send({ email: customerEmail, password: PASSWORD })
      .expect(200);
    const states = await agent
      .get('/v1/geo/states')
      .set('Origin', CUSTOMER_ORIGIN)
      .expect(200);
    const codes = (states.body as Array<{ code: string }>).map((s) => s.code);
    expect(codes).toContain(openCode);
    expect(codes).not.toContain(stateCode);
    await agent
      .get(`/v1/geo/states/${stateCode}/lgas`)
      .set('Origin', CUSTOMER_ORIGIN)
      .expect(404);
  });
});
