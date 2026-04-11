import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { PrismaClient } from '../src/generated/prisma/client';

export interface PrismaScriptContext {
  databaseUrl: string;
  pool: Pool;
  prisma: PrismaClient;
}

export function createPrismaScriptContext(): PrismaScriptContext {
  const databaseUrl = process.env['DATABASE_URL'];

  if (!databaseUrl) {
    throw new Error('DATABASE_URL is not set');
  }

  const pool = new Pool({ connectionString: databaseUrl });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  return {
    databaseUrl,
    pool,
    prisma,
  };
}

export async function closePrismaScriptContext(
  context: PrismaScriptContext,
): Promise<void> {
  await context.prisma.$disconnect();
  await context.pool.end();
}

export function assertTestDatabase(databaseUrl: string): void {
  if (process.env['ALLOW_NON_TEST_DATABASE_SEED'] === 'true') {
    return;
  }

  const nodeEnv = process.env['NODE_ENV']?.toLowerCase();
  const looksLikeTestDatabase = /test|e2e/i.test(databaseUrl);

  if (nodeEnv === 'test' || looksLikeTestDatabase) {
    return;
  }

  throw new Error(
    'Refusing to seed e2e dummy data into a non-test database. Set NODE_ENV=test, use a test DATABASE_URL, or set ALLOW_NON_TEST_DATABASE_SEED=true to override.',
  );
}
