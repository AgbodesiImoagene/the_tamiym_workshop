import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthService, isMfaChallengeResponse } from '../src/auth/auth.service';
import { generateTotpCode } from '../src/auth/admin-mfa.totp';
import { PrismaService } from '../src/prisma/prisma.service';
import { ModerationDecisionService } from '../src/moderation/moderation-decision.service';
import {
  AuthSurface,
  ModerationActorKind,
  ModerationStatus,
  ModerationSubjectType,
  ProductStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

const PASSWORD = 'TestPassword1!';

describe('Moderation appeals (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;
  let decisions: ModerationDecisionService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);
    decisions = app.get(ModerationDecisionService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function createAdminBearer(): Promise<{
    id: string;
    accessToken: string;
  }> {
    const email = `mod-admin-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        firstName: 'Mod',
        lastName: 'Admin',
        emailVerifiedAt: new Date(),
      },
    });
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
    const totp = generateTotpCode(enrollment.secret);
    const session = await authService.adminMfaEnrollConfirm(
      challenge.mfa_token,
      totp,
    );
    return { id: user.id, accessToken: session.access_token };
  }

  it('appeals, withdraws, overturns, and rejects a second appeal', async () => {
    const stamp = Date.now();
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const owner = await prisma.user.create({
      data: {
        email: `mod-owner-${stamp}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Owner',
        lastName: 'Appeal',
      },
    });

    const category = await prisma.category.create({
      data: {
        name: `Mod Cat ${stamp}`,
        slug: `mod-cat-${stamp}`,
      },
    });
    const product = await prisma.product.create({
      data: {
        name: `Mod Product ${stamp}`,
        slug: `mod-product-${stamp}`,
        status: ProductStatus.ACTIVE,
        categoryId: category.id,
      },
    });

    const design = await prisma.design.create({
      data: {
        userId: owner.id,
        productId: product.id,
        name: 'Appeal Design',
        designData: { version: 1, views: {} },
        moderationStatus: ModerationStatus.PENDING,
      },
    });

    const rejected = await decisions.recordAdminDecision({
      subjectType: ModerationSubjectType.DESIGN,
      subjectId: design.id,
      outcome: ModerationStatus.REJECTED,
      actorUserId: 'seed-admin',
      notes: 'internal: hate score 0.91',
      withdrawPendingAppeals: false,
    });

    const ownerSession = await authService.login(
      { email: owner.email, password: PASSWORD },
      AuthSurface.CUSTOMER,
    );
    const ownerAuth = `Bearer ${ownerSession.access_token}`;

    const createRes = await request(app.getHttpServer())
      .post('/v1/moderation/appeals')
      .set('Authorization', ownerAuth)
      .send({
        decisionId: rejected.id,
        statement: 'This design is school-safe artwork.',
      })
      .expect(201);

    expect(createRes.body.status).toBe('PENDING');
    expect(JSON.stringify(createRes.body)).not.toMatch(/hate|0\.91/i);

    const withdrawRes = await request(app.getHttpServer())
      .post(`/v1/moderation/appeals/${createRes.body.id}/withdraw`)
      .set('Authorization', ownerAuth)
      .expect(200);
    expect(withdrawRes.body.status).toBe('WITHDRAWN');

    const flagged = await decisions.recordAdminDecision({
      subjectType: ModerationSubjectType.DESIGN,
      subjectId: design.id,
      outcome: ModerationStatus.FLAGGED,
      actorUserId: 'seed-admin-2',
      notes: 'internal queue',
      withdrawPendingAppeals: true,
    });

    const appeal2 = await request(app.getHttpServer())
      .post('/v1/moderation/appeals')
      .set('Authorization', ownerAuth)
      .send({
        decisionId: flagged.id,
        statement: 'Please approve this flagged design.',
      })
      .expect(201);

    const admin = await createAdminBearer();
    const resolveRes = await request(app.getHttpServer())
      .post(`/v1/admin/moderation/appeals/${appeal2.body.id}/resolve`)
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .send({ resolution: 'OVERTURNED' })
      .expect(200);

    expect(resolveRes.body.appeal.status).toBe('OVERTURNED');
    expect(resolveRes.body.resolutionDecision.outcome).toBe('APPROVED');
    expect(resolveRes.body.resolutionDecision.actorKind).toBe(
      ModerationActorKind.APPEAL_RESOLUTION,
    );

    await request(app.getHttpServer())
      .post('/v1/moderation/appeals')
      .set('Authorization', ownerAuth)
      .send({
        decisionId: flagged.id,
        statement: 'Trying again on an old decision',
      })
      .expect(400);
  });
});
