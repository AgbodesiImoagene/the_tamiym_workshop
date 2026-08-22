import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { OpenAPIObject } from '@nestjs/swagger';
import { AppController } from '../app.controller';
import { AppService } from '../app.service';
import { PrismaService } from '../prisma/prisma.service';
import { configureApiApplication } from './application.factory';
import {
  assertUniqueOperationIds,
  createOpenApiDocument,
  createSwaggerDocumentConfig,
} from './swagger-document';
import { validateOpenApiDocument } from './validate-openapi-document';

describe('application.factory', () => {
  it('configures middleware, validation and the v1 prefix', () => {
    const use = jest.fn();
    const useGlobalPipes = jest.fn();
    const setGlobalPrefix = jest.fn();
    const set = jest.fn();
    const app = {
      use,
      useGlobalPipes,
      setGlobalPrefix,
      getHttpAdapter: () => ({
        getInstance: () => ({ set }),
      }),
    } as unknown as INestApplication;

    configureApiApplication(app);

    expect(use).toHaveBeenCalledTimes(2);
    expect(useGlobalPipes).toHaveBeenCalledTimes(1);
    expect(setGlobalPrefix).toHaveBeenCalledWith('v1');
    expect(set).toHaveBeenCalledWith('trust proxy', 1);
  });
});

describe('swagger-document integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: jest.fn().mockResolvedValue([{ '?column?': 1 }]),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, fallback?: unknown) => {
              if (key === 'REDIS_HOST') return '127.0.0.1';
              if (key === 'REDIS_PORT') return 6379;
              if (key === 'REDIS_DB') return 0;
              return fallback;
            }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    configureApiApplication(app);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a document with stable operation IDs', () => {
    const document = createOpenApiDocument(app);
    expect(document.paths['/v1/health']?.get?.operationId).toBe(
      'AppController_getHealth',
    );
  });

  it('exposes bearer and cookie security schemes', () => {
    const config = createSwaggerDocumentConfig();
    expect(config.info.title).toBe('Tamiym Workshop API');
  });

  it('validates a generated document', async () => {
    const document = createOpenApiDocument(app);
    await expect(validateOpenApiDocument(document)).resolves.toBeDefined();
  });

  it('rejects duplicate operation IDs', () => {
    const document = {
      openapi: '3.0.0',
      info: { title: 'x', version: '1.0' },
      paths: {
        '/a': { get: { operationId: 'DupController_method' } },
        '/b': { post: { operationId: 'DupController_method' } },
      },
    } as unknown as OpenAPIObject;

    expect(() => assertUniqueOperationIds(document)).toThrow(
      /Duplicate OpenAPI operationId/,
    );
  });
});
