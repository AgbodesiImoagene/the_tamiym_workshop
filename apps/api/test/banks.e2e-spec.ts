import { INestApplication } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuthService } from '../src/auth/auth.service';
import {
  AuthSurface,
  UserRole,
  UserStatus,
} from '../src/generated/prisma/enums';
import { PrismaService } from '../src/prisma/prisma.service';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

const PASSWORD = 'TestPassword1!';

describe('Bank list (e2e)', () => {
  const originalFetch = globalThis.fetch;
  let app: INestApplication<App>;
  let prisma: PrismaService;
  let authService: AuthService;

  beforeAll(async () => {
    app = await createE2eApp();
    prisma = app.get(PrismaService);
    authService = app.get(AuthService);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  async function createOrganizerToken() {
    const email = `banks-${Date.now()}-${Math.random().toString(36).slice(2)}@example.com`;
    await prisma.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(PASSWORD, 10),
        role: UserRole.ORGANIZER,
        status: UserStatus.ACTIVE,
        firstName: 'Banks',
        lastName: 'Organizer',
        emailVerifiedAt: new Date(),
      },
    });
    const session = await authService.login(
      { email, password: PASSWORD },
      AuthSurface.CUSTOMER,
    );
    return session.access_token;
  }

  function mockPaystackBanks(banks: unknown[]) {
    const paystackFetch = jest.fn((input: string | URL | Request) =>
      String(input).startsWith('https://api.paystack.co/bank')
        ? Promise.resolve(
            new Response(JSON.stringify({ status: true, data: banks })),
          )
        : originalFetch(input),
    );
    globalThis.fetch = paystackFetch as unknown as typeof fetch;
    return paystackFetch;
  }

  it('gives organisers only the banks that can be selected', async () => {
    const accessToken = await createOrganizerToken();
    const paystackFetch = mockPaystackBanks([
      { id: 1, name: 'Access Bank', code: '044' },
      { id: 2, name: 'Empty code', code: '' },
      { id: 3, name: 'Null code', code: null },
      { id: 4, name: 'Guaranty Trust Bank', code: '058' },
    ]);

    const res = await request(app.getHttpServer())
      .get('/v1/banks')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(paystackFetch).toHaveBeenCalledTimes(1);
    expect(res.body).toEqual([
      { code: '044', name: 'Access Bank' },
      { code: '058', name: 'Guaranty Trust Bank' },
    ]);
  });
});
