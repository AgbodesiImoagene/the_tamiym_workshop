/**
 * TTW-266: repair test products whose colour option is coded `colour` and has no hex
 * (see src/products/fix-colour-options.ts).
 *
 * Usage (lists the changes; add `--apply` to write them):
 * DOTENV_CONFIG_PATH=.env.test pnpm --filter api exec ts-node -r dotenv/config -r tsconfig-paths/register scripts/fix-colour-options.ts [--apply]
 *
 * Reads DATABASE_URL and refuses a database whose name does not contain `test` or `e2e`
 * (no override).
 * It is safe to run again.
 */
import 'dotenv/config';
import { findColorByName } from '../../../packages/ui/src/lib/colors';
import {
  assertTestDatabaseName,
  fixColourOptions,
} from '../src/products/fix-colour-options';
import {
  closePrismaScriptContext,
  createPrismaScriptContext,
} from './_prisma-script-client';

async function main() {
  const apply = process.argv.includes('--apply');
  const context = createPrismaScriptContext();
  try {
    console.log(`Database: ${assertTestDatabaseName(context.databaseUrl)}`);

    const { options } = await fixColourOptions(
      {
        prisma: context.prisma,
        findHex: (name) => findColorByName(name)?.hex,
      },
      { apply },
    );

    for (const option of options) {
      if (option.skipped) {
        console.log(
          `- ${option.productName}: left as it is, the product has another color option`,
        );
        continue;
      }
      const filled = option.filled.map((v) => `${v.name} ${v.hex}`).join(', ');
      const unknown = option.unknown.map((v) => v.name).join(', ');
      console.log(
        `- ${option.productName}: colour -> color` +
          (filled ? `; hex: ${filled}` : '') +
          (unknown ? `; unknown name, no hex set: ${unknown}` : ''),
      );
    }
    const changed = options.filter((option) => !option.skipped).length;
    console.log(
      apply
        ? `Repaired ${changed} option(s).`
        : `[dry run] would repair ${changed} option(s). Nothing was written; add --apply.`,
    );
  } finally {
    await closePrismaScriptContext(context);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
