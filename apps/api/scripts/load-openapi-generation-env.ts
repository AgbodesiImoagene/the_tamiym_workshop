import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

const apiRoot = resolve(__dirname, '..');

process.env.NODE_ENV = 'test';
process.env.OTEL_SDK_DISABLED = 'true';
process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? 'error';

for (const envPath of [
  resolve(apiRoot, '.env.test'),
  resolve(apiRoot, '.env.test.example'),
]) {
  if (existsSync(envPath)) {
    loadEnv({ path: envPath, override: false, quiet: true });
  }
}
