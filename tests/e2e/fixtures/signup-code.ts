import { createRequire } from 'node:module';
import path from 'node:path';

/**
 * TTW-254: the sign-up code is random and only reaches the person by email, and e2e cannot read an
 * inbox. The API queues the email as a BullMQ job whose data holds the code, so the test reads it
 * from the same Redis the API uses. `ioredis` is the API's dependency, not the root's.
 *
 * This works because Playwright starts the API with `NODE_ENV=test` (see `serverEnv` in
 * `playwright.config.ts`), and under `NODE_ENV=test` the BullMQ mail processor does not autorun
 * (`shouldAutorunBullProcessors`), so the job keeps its data until the test reads it. A mail
 * worker running against the same Redis would delete the job once sent and break this helper.
 */
const apiRequire = createRequire(path.join(process.cwd(), 'apps/api/package.json'));

interface RedisLike {
  scan(cursor: string, ...args: Array<string | number>): Promise<[string, string[]]>;
  type(key: string): Promise<string>;
  hget(key: string, field: string): Promise<string | null>;
  disconnect(): void;
}

export async function latestSignupCode(email: string, timeoutMs = 15_000): Promise<string> {
  const Redis = apiRequire('ioredis') as new (options: object) => RedisLike;
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    db: Number(process.env.REDIS_DB || 0),
    maxRetriesPerRequest: 1,
  });
  try {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      let cursor = '0';
      let found: { code: string; at: number } | null = null;
      do {
        const [next, keys] = await redis.scan(cursor, 'MATCH', 'bull:mail:*', 'COUNT', 200);
        cursor = next;
        for (const key of keys) {
          // `bull:mail:*` also matches the queue's list, stream and counter keys, and HGET on those
          // raises WRONGTYPE: only the job hashes hold data.
          if ((await redis.type(key)) !== 'hash') continue;
          const raw = await redis.hget(key, 'data');
          if (!raw) continue;
          try {
            const data = JSON.parse(raw) as { to?: string; code?: string; expiresAt?: string };
            if (data.to === email && data.code) {
              const at = Date.parse(data.expiresAt ?? '') || 0;
              if (!found || at > found.at) found = { code: data.code, at };
            }
          } catch {
            // Not a JSON job payload.
          }
        }
      } while (cursor !== '0');
      if (found) return found.code;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`no sign-up code queued for ${email}`);
  } finally {
    redis.disconnect();
  }
}
