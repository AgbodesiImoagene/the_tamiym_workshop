/**
 * Deletes expired rows from auth_tokens. Run from cron in prod to curtail DB growth.
 *
 * Usage (from apps/api): pnpm run cleanup:tokens
 * Or: npx ts-node -r dotenv/config scripts/cleanup-expired-tokens.ts
 */
import 'dotenv/config';
import { Pool } from 'pg';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

async function main() {
  const connectionString = process.env['DATABASE_URL'];
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }

  const pool = new Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const prisma = new PrismaClient({ adapter });

  try {
    const result = await prisma.authToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    // eslint-disable-next-line no-console
    console.log(`Deleted ${result.count} expired auth token(s)`);
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
