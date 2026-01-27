import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import { PrismaService } from '../prisma/prisma.service';
import * as bcrypt from 'bcrypt';

describe('AuthController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    prisma = moduleFixture.get<PrismaService>(PrismaService);
    await app.init();
  });

  afterAll(async () => {
    // Clean up test data
    await prisma.user.deleteMany({
      where: {
        email: {
          in: ['test@example.com', 'test2@example.com'],
        },
      },
    });
    await app.close();
  });

  describe('/auth/register (POST)', () => {
    it('should register a new user', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User',
      };

      const response = await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(registerDto)
        .expect(201);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(registerDto.email);
      expect(response.body.user.firstName).toBe(registerDto.firstName);
      expect(response.body.user.lastName).toBe(registerDto.lastName);
      expect(response.body.user).not.toHaveProperty('password');
    });

    it('should return 409 if email already exists', async () => {
      const registerDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(registerDto)
        .expect(409);
    });

    it('should return 400 for invalid input', async () => {
      const registerDto = {
        email: 'invalid-email',
        password: '123', // Too short
      };

      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(registerDto)
        .expect(400);
    });
  });

  describe('/auth/login (POST)', () => {
    it('should login with valid credentials', async () => {
      // Create a user first
      const hashedPassword = await bcrypt.hash('password123', 10);
      await prisma.user.create({
        data: {
          email: 'test2@example.com',
          password: hashedPassword,
          role: 'CUSTOMER',
        },
      });

      const loginDto = {
        email: 'test2@example.com',
        password: 'password123',
      };

      const response = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send(loginDto)
        .expect(200);

      expect(response.body).toHaveProperty('user');
      expect(response.body.user.email).toBe(loginDto.email);
      expect(response.headers['set-cookie']).toBeDefined();
    });

    it('should return 401 for invalid credentials', async () => {
      const loginDto = {
        email: 'test2@example.com',
        password: 'wrongpassword',
      };

      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send(loginDto)
        .expect(401);
    });

    it('should return 401 for non-existent user', async () => {
      const loginDto = {
        email: 'nonexistent@example.com',
        password: 'password123',
      };

      await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send(loginDto)
        .expect(401);
    });
  });

  describe('/auth/me (GET)', () => {
    it('should return current user when authenticated', async () => {
      // Register and login first
      const registerDto = {
        email: 'me@example.com',
        password: 'password123',
      };

      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(registerDto)
        .expect(201);

      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send(registerDto)
        .expect(200);

      const cookies = loginResponse.headers['set-cookie'];

      const meResponse = await request(app.getHttpServer())
        .get('/v1/auth/me')
        .set('Cookie', cookies)
        .expect(200);

      expect(meResponse.body).toHaveProperty('id');
      expect(meResponse.body.email).toBe(registerDto.email);
    });

    it('should return 401 when not authenticated', async () => {
      await request(app.getHttpServer()).get('/v1/auth/me').expect(401);
    });
  });

  describe('/auth/logout (POST)', () => {
    it('should logout successfully', async () => {
      // Register and login first
      const registerDto = {
        email: 'logout@example.com',
        password: 'password123',
      };

      await request(app.getHttpServer())
        .post('/v1/auth/register')
        .send(registerDto)
        .expect(201);

      const loginResponse = await request(app.getHttpServer())
        .post('/v1/auth/login')
        .send(registerDto)
        .expect(200);

      const cookies = loginResponse.headers['set-cookie'];

      const logoutResponse = await request(app.getHttpServer())
        .post('/v1/auth/logout')
        .set('Cookie', cookies)
        .expect(200);

      expect(logoutResponse.body).toHaveProperty('message');
      expect(logoutResponse.body.message).toBe('Logged out successfully');
    });
  });
});
