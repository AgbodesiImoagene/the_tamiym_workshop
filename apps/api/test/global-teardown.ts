import Redis from 'ioredis';
import { resolve } from 'node:path';
import { config as loadEnv } from 'dotenv';

export default async function globalTeardown(): Promise<void> {
  loadEnv({
    path: resolve(__dirname, '../.env.test'),
    override: false,
    quiet: true,
  });

  const host = process.env.REDIS_HOST || '127.0.0.1';
  const port = Number(process.env.REDIS_PORT || 6379);
  const db = Number(process.env.REDIS_DB || 15);
  const password = process.env.REDIS_PASSWORD || undefined;

  const redis = new Redis({
    host,
    port,
    db,
    password,
    maxRetriesPerRequest: 1,
    lazyConnect: true,
  });

  try {
    await redis.connect();
    await redis.flushdb();
  } catch (err) {
    console.warn(
      `[e2e globalTeardown] Redis flush skipped: ${err instanceof Error ? err.message : String(err)}`,
    );
  } finally {
    redis.disconnect();
  }
}
