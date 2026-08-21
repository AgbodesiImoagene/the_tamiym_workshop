import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthService, isMfaChallengeResponse } from '../src/auth/auth.service';
import { generateTotpCode } from '../src/auth/admin-mfa.totp';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  AuthSurface,
  CampaignStatus,
  OrganizerApplicationStatus,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';
import { ORGANIZER_TERMS_VERSION } from '../src/organizer/organizer.constants';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

const PASSWORD = 'TestPassword1!';

describe('Organiser onboarding (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function createCustomer(opts?: {
    verified?: boolean;
    phone?: string | null;
  }) {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const user = await prisma.user.create({
      data: {
        email: `org-cust-${stamp}@example.com`,
        passwordHash,
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Organiser',
        lastName: 'Applicant',
        phone: opts?.phone === undefined ? '+2348022222222' : opts.phone,
        emailVerifiedAt: opts?.verified === false ? null : new Date(),
      },
    });
    const session = await authService.login(
      { email: user.email, password: PASSWORD },
      AuthSurface.CUSTOMER,
    );
    return { user, accessToken: session.access_token };
  }

  async function createAdminBearer() {
    const email = `org-admin-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
        firstName: 'Org',
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

  function applicationBody() {
    return {
      organisationName: 'Community Kits NG',
      intendedUse:
        'We raise funds for school kits and meal support across Lagos public schools.',
      termsVersion: ORGANIZER_TERMS_VERSION,
      termsAcceptedAt: new Date().toISOString(),
    };
  }

  it('customer apply → admin approve → ORGANIZER → create DRAFT campaign', async () => {
    const customer = await createCustomer();
    const admin = await createAdminBearer();
    const customerAuth = `Bearer ${customer.accessToken}`;
    const adminAuth = `Bearer ${admin.accessToken}`;

    const eligibility = await request(app.getHttpServer())
      .get('/v1/organiser/applications/eligibility')
      .set('Authorization', customerAuth)
      .expect(200);
    expect(eligibility.body.eligible).toBe(true);

    const submit = await request(app.getHttpServer())
      .post('/v1/organiser/applications')
      .set('Authorization', customerAuth)
      .send(applicationBody())
      .expect(201);
    expect(submit.body.status).toBe(OrganizerApplicationStatus.PENDING);
    expect(JSON.stringify(submit.body)).not.toMatch(/internalNotes/i);

    await request(app.getHttpServer())
      .post(`/v1/admin/organiser/applications/${submit.body.id}/approve`)
      .set('Authorization', adminAuth)
      .send({})
      .expect(200);

    const updatedUser = await prisma.user.findUniqueOrThrow({
      where: { id: customer.user.id },
    });
    expect(updatedUser.role).toBe(UserRole.ORGANIZER);

    const organizerSession = await authService.login(
      { email: customer.user.email, password: PASSWORD },
      AuthSurface.CUSTOMER,
    );
    const organizerAuth = `Bearer ${organizerSession.access_token}`;

    const campaign = await request(app.getHttpServer())
      .post('/v1/campaigns')
      .set('Authorization', organizerAuth)
      .send({
        title: `Draft Fundraiser ${Date.now()}`,
        description: 'Slice-1 draft campaign entry',
      })
      .expect(201);
    expect(campaign.body.status).toBe(CampaignStatus.DRAFT);
  });

  it('enforces one PENDING application and supports withdraw', async () => {
    const customer = await createCustomer();
    const auth = `Bearer ${customer.accessToken}`;
    const body = applicationBody();

    const first = await request(app.getHttpServer())
      .post('/v1/organiser/applications')
      .set('Authorization', auth)
      .send(body)
      .expect(201);

    await request(app.getHttpServer())
      .post('/v1/organiser/applications')
      .set('Authorization', auth)
      .send(body)
      .expect(409);

    await request(app.getHttpServer())
      .post(`/v1/organiser/applications/${first.body.id}/withdraw`)
      .set('Authorization', auth)
      .expect(200);

    const after = await prisma.organizerApplication.findUniqueOrThrow({
      where: { id: first.body.id },
    });
    expect(after.status).toBe(OrganizerApplicationStatus.WITHDRAWN);

    await request(app.getHttpServer())
      .post('/v1/organiser/applications')
      .set('Authorization', auth)
      .send(body)
      .expect(201);
  });

  it('rejects ineligible applicants without verified email', async () => {
    const customer = await createCustomer({ verified: false });
    await request(app.getHttpServer())
      .post('/v1/organiser/applications')
      .set('Authorization', `Bearer ${customer.accessToken}`)
      .send(applicationBody())
      .expect(400);
  });
});
