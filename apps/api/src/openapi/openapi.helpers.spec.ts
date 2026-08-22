import type { OpenAPIObject } from '@nestjs/swagger';
import {
  normalizeOpenApiDocument,
  repairSecuritySchemes,
  serializeOpenApiDocument,
} from './normalize-openapi-document';
import {
  buildOperationId,
  findDuplicateOperationIds,
} from './swagger-document';

describe('normalizeOpenApiDocument', () => {
  it('recursively sorts object keys', () => {
    const input = {
      z: 1,
      a: { y: 2, b: 3 },
      m: [{ c: 1, a: 2 }],
    };

    expect(normalizeOpenApiDocument(input)).toEqual({
      a: { b: 3, y: 2 },
      m: [{ a: 2, c: 1 }],
      z: 1,
    });
  });

  it('repairs Nest bearer and cookie security schemes', () => {
    const document = {
      components: {
        securitySchemes: {
          'JWT-auth': {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
            name: 'JWT',
            in: 'header',
          },
          cookie: {
            type: 'http',
            in: 'Cookie',
            scheme: 'Bearer',
          },
        },
      },
    } as unknown as OpenAPIObject;

    expect(repairSecuritySchemes(document)).toEqual({
      components: {
        securitySchemes: {
          'JWT-auth': {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          cookie: {
            type: 'apiKey',
            in: 'cookie',
            name: 'access_token',
          },
        },
      },
    });
  });

  it('sorts tags and required arrays for stable output', () => {
    const input = {
      tags: ['Admin', 'Auth'],
      required: ['b', 'a'],
    };

    expect(normalizeOpenApiDocument(input)).toEqual({
      required: ['a', 'b'],
      tags: ['Admin', 'Auth'],
    });
  });

  it('serializes with a trailing newline', () => {
    const serialized = serializeOpenApiDocument({
      openapi: '3.0.0',
      info: { title: 'Test', version: '1.0' },
      paths: {},
    } as OpenAPIObject);

    expect(serialized.endsWith('\n')).toBe(true);
    expect(JSON.parse(serialized.trim())).toEqual({
      info: { title: 'Test', version: '1.0' },
      openapi: '3.0.0',
      paths: {},
    });
  });
});

describe('buildOperationId', () => {
  it('uses ControllerName_methodName convention', () => {
    expect(buildOperationId('AuthController', 'login')).toBe(
      'AuthController_login',
    );
  });
});

describe('findDuplicateOperationIds', () => {
  it('returns duplicate operation locations', () => {
    const document = {
      paths: {
        '/v1/a': {
          get: { operationId: 'AuthController_login' },
        },
        '/v1/b': {
          post: { operationId: 'AuthController_login' },
        },
      },
    } as unknown as OpenAPIObject;

    expect(findDuplicateOperationIds(document)).toEqual([
      {
        operationId: 'AuthController_login',
        first: 'GET /v1/a',
        second: 'POST /v1/b',
      },
    ]);
  });
});
