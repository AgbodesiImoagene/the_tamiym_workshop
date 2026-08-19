import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { closeE2eApp, createE2eApp } from './utils/create-e2e-app';

describe('Products (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    app = await createE2eApp();
  });

  afterAll(async () => {
    await closeE2eApp(app);
  });

  describe('GET /v1/categories', () => {
    it('should return 200 and array of categories', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/categories')
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });

  describe('GET /v1/products', () => {
    it('should return 200 and array of products', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/products')
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should accept query params categoryId and available', async () => {
      const res = await request(app.getHttpServer())
        .get('/v1/products')
        .query({ categoryId: 'cat-1', available: 'true' })
        .expect(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
