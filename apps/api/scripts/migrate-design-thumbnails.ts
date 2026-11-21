/**
 * TTW-237: clear legacy public design thumbnails (see src/designs/migrate-design-thumbnails.ts).
 *
 * Usage:
 * pnpm --filter api exec ts-node -r dotenv/config -r tsconfig-paths/register scripts/migrate-design-thumbnails.ts [--dry-run]
 *
 * Reads DATABASE_URL and the S3_* variables from the environment (`.env`). Run it once per
 * database. It is safe to run again.
 */
import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import { S3Service } from '../src/storage/s3.service';
import { migrateDesignThumbnails } from '../src/designs/migrate-design-thumbnails';
import {
  closePrismaScriptContext,
  createPrismaScriptContext,
} from './_prisma-script-client';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const context = createPrismaScriptContext();
  try {
    const s3 = new S3Service(new ConfigService());
    const result = await migrateDesignThumbnails(
      { prisma: context.prisma, s3 },
      { dryRun },
    );
    console.log(
      `${dryRun ? '[dry run] would clear' : 'Cleared'} ${result.designsCleared} design thumbnail value(s) and ${
        dryRun ? 'delete' : 'deleted'
      } ${result.publicObjectsDeleted} public object(s).`,
    );
  } finally {
    await closePrismaScriptContext(context);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
