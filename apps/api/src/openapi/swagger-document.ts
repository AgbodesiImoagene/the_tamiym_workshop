import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { OpenAPIObject } from '@nestjs/swagger';

/**
 * Stable operation ID convention: `ControllerName_methodName`.
 * Matches Nest controller class and handler method identity.
 */
export function buildOperationId(
  controllerKey: string,
  methodKey: string,
): string {
  return `${controllerKey}_${methodKey}`;
}

/** DocumentBuilder config shared by runtime Swagger UI and OpenAPI export. */
export function createSwaggerDocumentConfig(): ReturnType<
  DocumentBuilder['build']
> {
  return new DocumentBuilder()
    .setTitle('Tamiym Workshop API')
    .setDescription('API documentation for Tamiym Workshop platform')
    .setVersion('1.0')
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth',
    )
    .addCookieAuth('access_token', {
      type: 'http',
      in: 'Cookie',
      scheme: 'Bearer',
    })
    .addTag('Health', 'Health check endpoints')
    .addTag('Auth', 'Authentication endpoints')
    .addTag('Users', 'User management endpoints')
    .addTag('Products', 'Product catalog endpoints')
    .addTag('Orders', 'Order management endpoints')
    .addTag('Fundraising', 'Fundraising campaign endpoints')
    .addTag('Admin', 'Admin-only endpoints')
    .build();
}

export interface CreateOpenApiDocumentOptions {
  /** When false, skips duplicate operationId enforcement (tests only). */
  assertUniqueOperationIds?: boolean;
}

const HTTP_METHODS = new Set([
  'get',
  'put',
  'post',
  'delete',
  'options',
  'head',
  'patch',
  'trace',
]);

/**
 * Collect operation IDs and fail when the stable convention produces duplicates.
 */
export function findDuplicateOperationIds(
  document: OpenAPIObject,
): Array<{ operationId: string; first: string; second: string }> {
  const seen = new Map<string, string>();
  const duplicates: Array<{
    operationId: string;
    first: string;
    second: string;
  }> = [];

  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    if (!pathItem || typeof pathItem !== 'object') continue;

    for (const [method, operation] of Object.entries(pathItem)) {
      if (!HTTP_METHODS.has(method)) continue;
      if (!operation || typeof operation !== 'object') continue;

      const operationId = (operation as { operationId?: string }).operationId;
      if (!operationId) continue;

      const location = `${method.toUpperCase()} ${path}`;
      const existing = seen.get(operationId);
      if (existing) {
        duplicates.push({
          operationId,
          first: existing,
          second: location,
        });
      } else {
        seen.set(operationId, location);
      }
    }
  }

  return duplicates;
}

export function assertUniqueOperationIds(document: OpenAPIObject): void {
  const duplicates = findDuplicateOperationIds(document);
  if (duplicates.length === 0) return;

  const detail = duplicates
    .map(
      (entry) => `"${entry.operationId}" at ${entry.first} and ${entry.second}`,
    )
    .join('; ');
  throw new Error(`Duplicate OpenAPI operationId values: ${detail}`);
}

/** Build an OpenAPI 3 document from a configured Nest application. */
export function createOpenApiDocument(
  app: INestApplication,
  options: CreateOpenApiDocumentOptions = {},
): OpenAPIObject {
  const config = createSwaggerDocumentConfig();
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: buildOperationId,
  });

  if (options.assertUniqueOperationIds !== false) {
    assertUniqueOperationIds(document);
  }

  return document;
}
