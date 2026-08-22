import SwaggerParser from '@apidevtools/swagger-parser';
import type { OpenAPIObject } from '@nestjs/swagger';
import { assertUniqueOperationIds } from './swagger-document';
import { repairSecuritySchemes } from './normalize-openapi-document';

/**
 * Validate an OpenAPI document with swagger-parser and enforce operationId uniqueness.
 */
export async function validateOpenApiDocument(
  document: OpenAPIObject,
): Promise<OpenAPIObject> {
  assertUniqueOperationIds(document);
  const repaired = repairSecuritySchemes(structuredClone(document));
  return (await SwaggerParser.validate(
    repaired as unknown as Parameters<typeof SwaggerParser.validate>[0],
  )) as OpenAPIObject;
}
