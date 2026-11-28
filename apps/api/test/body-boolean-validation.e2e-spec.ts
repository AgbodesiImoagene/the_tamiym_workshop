import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';
import { generateTotpCode } from '../src/auth/admin-mfa.totp';
import { AuthService, isMfaChallengeResponse } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  AuthSurface,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';

const PASSWORD = 'TestPassword1!';

/**
 * TTW-274: a boolean sent as a string must not reach the database. Runs the
 * production AppModule against real Postgres, through a real admin route.
 */
describe('Booleans in request bodies (e2e)', () => {
  const suffix = `${Date.now()}`;
  const email = `body-boolean-${suffix}@example.com`;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminAuth: string;
  let userId: string;
  const zoneIds: string[] = [];

  async function makeZone(isActive: boolean) {
    const zone = await prisma.shippingZone.create({
      data: {
        name: `Boolean Zone ${suffix}-${zoneIds.length}`,
        isActive,
      },
    });
    zoneIds.push(zone.id);
    return zone;
  }

  const patchZone = (id: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .patch(`/v1/admin/shipping-zones/${id}`)
      .set('Authorization', adminAuth)
      .send(body);

  const storedIsActive = async (id: string) =>
    (await prisma.shippingZone.findUniqueOrThrow({ where: { id } })).isActive;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    const authService = app.get(AuthService);

    const admin = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        emailVerifiedAt: new Date(),
        firstName: 'Boolean',
        lastName: 'Admin',
      },
    });
    userId = admin.id;
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
  });

  afterAll(async () => {
    await prisma.shippingZone.deleteMany({ where: { id: { in: zoneIds } } });
    await prisma.auditLog.deleteMany({ where: { actorUserId: userId } });
    await prisma.user.deleteMany({ where: { id: userId } });
    await closeE2eApp(app);
  });

  it('does not activate a zone when "false" is sent as a string', async () => {
    const zone = await makeZone(false);

    const response = await patchZone(zone.id, { isActive: 'false' });

    expect(await storedIsActive(zone.id)).toBe(false);
    expect(response.status).toBe(400);
  });

  it('still stores the real booleans', async () => {
    const zone = await makeZone(false);

    await patchZone(zone.id, { isActive: true }).expect(200);
    expect(await storedIsActive(zone.id)).toBe(true);

    await patchZone(zone.id, { isActive: false }).expect(200);
    expect(await storedIsActive(zone.id)).toBe(false);
  });
});
