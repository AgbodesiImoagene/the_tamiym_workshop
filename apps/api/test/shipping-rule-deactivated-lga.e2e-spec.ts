import { INestApplication } from '@nestjs/common';
import request from 'supertest';
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

// A state used only by this file, so deactivating it never disturbs the
// shared reference rows (Lagos, ...) other e2e files rely on.
const STATE_CODE = 'ZQ';
const STATE_NAME = 'Sigma Test State';

/**
 * TTW-202: an LGA an admin deactivated is no longer offered to customers, so
 * a new ADMIN2 rule or LGA area cannot name it. A rule created while the LGA
 * was active keeps existing and stays editable.
 */
describe('Shipping rule with a deactivated LGA (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let adminAuth: string;
  let adminId: string;
  let zoneId: string;
  let lgaId: string;
  let otherLgaId: string;
  let lgaName: string;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    const authService = app.get(AuthService);

    const suffix = `rule-lga-off-${Date.now()}`;
    const password = 'TestPassword1!';
    const email = `${suffix}@example.com`;
    const admin = await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        firstName: 'Rule',
        lastName: 'Admin',
        emailVerifiedAt: new Date(),
      },
    });
    adminId = admin.id;
    const challenge = await authService.login(
      { email, password },
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

    await prisma.geoState.upsert({
      where: { code: STATE_CODE },
      update: { isActive: true },
      create: { code: STATE_CODE, name: STATE_NAME, isActive: true },
    });
    const lga = await prisma.geoLga.create({
      data: { stateCode: STATE_CODE, name: `Sigma LGA ${suffix}` },
    });
    lgaId = lga.id;
    lgaName = lga.name;
    const other = await prisma.geoLga.create({
      data: { stateCode: STATE_CODE, name: `Sigma other LGA ${suffix}` },
    });
    otherLgaId = other.id;
    const zone = await prisma.shippingZone.create({
      data: { name: `Rule LGA off zone ${suffix}` },
    });
    zoneId = zone.id;
  });

  afterAll(async () => {
    await prisma.shippingZoneArea.deleteMany({ where: { zoneId } });
    await prisma.shippingZoneRule.deleteMany({ where: { zoneId } });
    await prisma.shippingZone.delete({ where: { id: zoneId } });
    await prisma.geoLga.deleteMany({ where: { stateCode: STATE_CODE } });
    await prisma.geoState.deleteMany({ where: { code: STATE_CODE } });
    await prisma.authSession.deleteMany({ where: { userId: adminId } });
    await prisma.user.delete({ where: { id: adminId } });
    await closeE2eApp(app);
  });

  const post = (path: string, body: Record<string, unknown>) =>
    request(app.getHttpServer())
      .post(path)
      .set('Authorization', adminAuth)
      .send(body);

  it('refuses new rules and areas for a deactivated LGA and leaves existing rules alone', async () => {
    const rulesUrl = `/v1/admin/shipping-zones/${zoneId}/rules`;
    const adminTwo = (matchValue: string) => ({
      countryCode: 'NG',
      matchType: ShippingRuleMatchType.ADMIN2,
      matchValue,
      matchContext: STATE_CODE,
    });

    // While the LGA is active, a rule for it is accepted.
    const existing = await post(rulesUrl, adminTwo(lgaId)).expect(201);
    const ruleId = existing.body.id as string;

    await prisma.geoLga.update({
      where: { id: lgaId },
      data: { isActive: false },
    });
    const rulesBefore = await prisma.shippingZoneRule.count({
      where: { zoneId },
    });

    // New rules are refused by id and by name.
    const byId = await post(rulesUrl, adminTwo(lgaId)).expect(400);
    expect(byId.body.message).toBe(`LGA ${lgaName} is deactivated`);
    await post(rulesUrl, adminTwo(lgaName)).expect(400);

    // The legacy area endpoint is refused too, and writes no area or rule.
    await post(`/v1/admin/shipping-zones/${zoneId}/areas`, {
      stateCode: STATE_CODE,
      lgaId,
    }).expect(400);
    expect(await prisma.shippingZoneRule.count({ where: { zoneId } })).toBe(
      rulesBefore,
    );
    expect(await prisma.shippingZoneArea.count({ where: { zoneId } })).toBe(0);

    // The rule made earlier is untouched and can still be edited.
    const patch = (body: Record<string, unknown>) =>
      request(app.getHttpServer())
        .patch(`/v1/admin/shipping-rules/${ruleId}`)
        .set('Authorization', adminAuth)
        .send(body);
    const edited = await patch({ priority: 50, isActive: false }).expect(200);
    expect(edited.body).toMatchObject({
      id: ruleId,
      matchValue: lgaId,
      priority: 50,
      isActive: false,
    });

    // Moving a rule to a deactivated LGA is refused; to an active one it works.
    await patch({ matchValue: otherLgaId }).expect(200);
    await patch({ matchValue: lgaId }).expect(400);

    // Once the LGA is active again, the same request is accepted.
    await prisma.geoLga.update({
      where: { id: lgaId },
      data: { isActive: true },
    });
    await post(rulesUrl, adminTwo(lgaId)).expect(201);
  });
});
