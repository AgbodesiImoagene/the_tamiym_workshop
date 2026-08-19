import { config as loadEnv } from 'dotenv';
import { resolve } from 'node:path';

process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'error';

loadEnv({
  path: resolve(__dirname, '../.env.test'),
  override: false,
  quiet: true,
});
