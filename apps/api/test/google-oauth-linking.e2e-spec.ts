import { INestApplication, ValidationPipe } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test, TestingModule } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import express from 'express';
import request from 'supertest';
import type { Response } from 'supertest';
import { App } from 'supertest/types';
import * as bcrypt from 'bcrypt';
import { AppModule } from '../src/app.module';
import { GoogleOAuthService } from '../src/auth/google-oauth.service';
import type { GoogleOAuthProfile } from '../src/auth/auth.service';
import { PrismaService } from '../src/prisma/prisma.service';
import {
  CUSTOMER_ACCESS_COOKIE_NAME,
  CUSTOMER_REFRESH_COOKIE_NAME,
  GOOGLE_OAUTH_STATE_COOKIE_NAME,
} from '../src/constants';
import {
  OAuthProvider,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/client';
import { closeE2eApp } from './utils/create-e2e-app';

/**
 * Stands in for Google only: the code exchange and id_token verification are
 * an external provider call. Everything after it (controller, AuthService,
 * Prisma, cookies) is the production wiring.
 */
class FakeGoogleOAuthService {
  nextProfile: GoogleOAuthProfile | null = null;

  isConfigured(): boolean {
    return true;
  }

  buildAuthorizeUrl(state: string): string {
    return `https://accounts.google.test/auth?state=${state}`;
  }

  exchangeCodeForProfile(): Promise<GoogleOAuthProfile> {
    if (!this.nextProfile) throw new Error('no fake Google profile set');
    return Promise.resolve(this.nextProfile);
  }
}

function setCookieValue(res: Response, name: string): string | undefined {
  const raw = res.headers['set-cookie'];
  const cookies: string[] = Array.isArray(raw) ? raw : raw ? [raw] : [];
  for (const cookie of cookies) {
    const [pair] = cookie.split(';');
    const index = pair.indexOf('=');
    if (pair.slice(0, index) === name) {
      return decodeURIComponent(pair.slice(index + 1));
    }
  }
  return undefined;
}

/**
 * TTW-082: Google sign-in links to an existing account, or creates one, only
 * when Google confirms the email address.
 */
describe('Google sign-in account linking (TTW-082)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaService;
  const google = new FakeGoogleOAuthService();

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(GoogleOAuthService)
      .useValue(google)
      .compile();

    app = moduleFixture.createNestApplication({ bodyParser: false });
    app.use(express.json());
    app.use(cookieParser());
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.setGlobalPrefix('v1');
    app.enableShutdownHooks();
    await app.init();

    try {
      const registry = app.get(SchedulerRegistry, { strict: false });
      for (const name of [...registry.getCronJobs().keys()]) {
        registry.deleteCronJob(name);
      }
    } catch {
      // no scheduler
    }

    prisma = app.get(PrismaService);
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function createPasswordAccount(suffix: string) {
    return prisma.user.create({
      data: {
        email: `google-link-${suffix}@example.com`,
        passwordHash: await bcrypt.hash('TestPassword1!', 10),
        role: UserRole.CUSTOMER,
        status: UserStatus.ACTIVE,
        firstName: 'Existing',
        lastName: 'Customer',
        emailVerifiedAt: new Date(),
      },
    });
  }

  function callback() {
    const state = 'a'.repeat(64);
    return request(app.getHttpServer())
      .get('/v1/auth/google/callback')
      .query({ code: 'fake-code', state })
      .set('Cookie', `${GOOGLE_OAUTH_STATE_COOKIE_NAME}=${state}`);
  }

  it('leaves an existing password account unlinked when Google has not confirmed the email', async () => {
    const suffix = `unverified-${Date.now()}`;
    const user = await createPasswordAccount(suffix);
    google.nextProfile = {
      providerAccountId: `sub-${suffix}`,
      email: user.email.toUpperCase(),
      emailVerified: false,
    };

    const res = await callback().expect(302);

    expect(res.headers.location).toContain('/auth/login?error=google_failed');
    expect(setCookieValue(res, CUSTOMER_ACCESS_COOKIE_NAME)).toBeFalsy();
    expect(setCookieValue(res, CUSTOMER_REFRESH_COOKIE_NAME)).toBeFalsy();
    await expect(
      prisma.userOAuthAccount.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
    await expect(
      prisma.userOAuthAccount.count({
        where: {
          provider: OAuthProvider.GOOGLE,
          providerAccountId: `sub-${suffix}`,
        },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma.authSession.count({ where: { userId: user.id } }),
    ).resolves.toBe(0);
  });

  it('creates no account when Google has not confirmed an unknown email', async () => {
    const suffix = `unverified-new-${Date.now()}`;
    const email = `google-link-${suffix}@example.com`;
    google.nextProfile = {
      providerAccountId: `sub-${suffix}`,
      email,
      emailVerified: false,
    };

    const res = await callback().expect(302);

    expect(res.headers.location).toContain('/auth/login?error=google_failed');
    await expect(prisma.user.count({ where: { email } })).resolves.toBe(0);
  });

  it('links the existing account when Google confirms the email', async () => {
    const suffix = `verified-${Date.now()}`;
    const user = await createPasswordAccount(suffix);
    google.nextProfile = {
      providerAccountId: `sub-${suffix}`,
      email: user.email,
      emailVerified: true,
    };

    const res = await callback().expect(302);

    expect(res.headers.location).not.toContain('error=');
    expect(setCookieValue(res, CUSTOMER_ACCESS_COOKIE_NAME)).toBeTruthy();
    await expect(
      prisma.userOAuthAccount.findMany({ where: { userId: user.id } }),
    ).resolves.toEqual([
      expect.objectContaining({
        provider: OAuthProvider.GOOGLE,
        providerAccountId: `sub-${suffix}`,
      }),
    ]);
  });

  it('keeps an already-linked account signing in when the claim is now false', async () => {
    const suffix = `linked-${Date.now()}`;
    const user = await createPasswordAccount(suffix);
    await prisma.userOAuthAccount.create({
      data: {
        provider: OAuthProvider.GOOGLE,
        providerAccountId: `sub-${suffix}`,
        userId: user.id,
      },
    });
    google.nextProfile = {
      providerAccountId: `sub-${suffix}`,
      email: user.email,
      emailVerified: false,
    };

    const res = await callback().expect(302);

    expect(res.headers.location).not.toContain('error=');
    expect(setCookieValue(res, CUSTOMER_ACCESS_COOKIE_NAME)).toBeTruthy();
  });
});
