import 'reflect-metadata';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';
import { createApiApplication } from '../src/openapi/application.factory';
import { serializeOpenApiDocument } from '../src/openapi/normalize-openapi-document';
import { createOpenApiDocument } from '../src/openapi/swagger-document';
import { validateOpenApiDocument } from '../src/openapi/validate-openapi-document';

const scriptDir = __dirname;
const apiRoot = resolve(scriptDir, '..');
const repoRoot = resolve(apiRoot, '../..');
const defaultOutput = resolve(repoRoot, 'docs/openapi/openapi.json');

function loadGenerationEnv(): void {
  process.env.NODE_ENV = 'test';
  process.env.OTEL_SDK_DISABLED = 'true';
  process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error';

  loadEnv({
    path: resolve(apiRoot, '.env.test'),
    override: false,
    quiet: true,
  });
}

function parseOutputPath(argv: string[]): string {
  const flagIndex = argv.indexOf('--output');
  if (flagIndex === -1) return defaultOutput;
  const value = argv[flagIndex + 1];
  if (!value) {
    throw new Error('Missing value for --output');
  }
  return resolve(value);
}

export async function generateOpenApiArtifact(
  outputPath: string = defaultOutput,
): Promise<string> {
  loadGenerationEnv();

  const app = await createApiApplication();
  app.enableShutdownHooks();

  try {
    await app.init();
    const document = createOpenApiDocument(app);
    const validated = await validateOpenApiDocument(document);
    const serialized = serializeOpenApiDocument(validated);

    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized, 'utf8');
    return serialized;
  } finally {
    await app.close();
  }
}

async function main(): Promise<void> {
  const outputPath = parseOutputPath(process.argv.slice(2));
  console.log(`Generating OpenAPI document to ${outputPath}`);
  await generateOpenApiArtifact(outputPath);
  console.log('OpenAPI document generated successfully.');
}

if (require.main === module) {
  main().catch((error: unknown) => {
    console.error('OpenAPI generation failed:', error);
    process.exit(1);
  });
}
