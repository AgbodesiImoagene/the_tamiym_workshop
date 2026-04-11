import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';

/**
 * Integration tests: customers cannot access organizer-only or admin-only routes.
 * Registration must not accept role (all self-signups are CUSTOMER).
 */
describe('Auth and role boundaries (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );
    app.setGlobalPrefix('v1');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('register creates CUSTOMER only (no role in body)', async () => {
    const email = `customer-${Date.now()}@example.com`;
    const res = await request(app.getHttpServer())
      .post('/v1/auth/register')
      .send({
        email,
        password: 'TestPassword1!',
        firstName: 'Test',
        lastName: 'Customer',
      })
      .expect(201);
    expect(res.body).toHaveProperty('user');
    expect(res.body.user).toHaveProperty('role', 'CUSTOMER');
    expect(res.body.user).not.toHaveProperty('password');
  });

  it('customer cannot access admin list orders', async () => {
    const email = `cust-admin-${Date.now()}@example.com`;
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/v1/auth/register')
      .send({
        email,
        password: 'TestPassword1!',
        firstName: 'Test',
        lastName: 'User',
      })
      .expect(201);
    await agent.get('/v1/admin/orders').expect(403);
  });

  it('customer cannot create campaign (organizer only)', async () => {
    const email = `cust-campaign-${Date.now()}@example.com`;
    const agent = request.agent(app.getHttpServer());
    await agent
      .post('/v1/auth/register')
      .send({
        email,
        password: 'TestPassword1!',
        firstName: 'Test',
        lastName: 'User',
      })
      .expect(201);
    await agent
      .post('/v1/campaigns')
      .send({ title: 'Test Campaign' })
      .expect(403);
  });
});
