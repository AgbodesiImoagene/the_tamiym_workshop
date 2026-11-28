/**
 * Idempotent repair for TTW-266: options coded `colour` (British spelling) are renamed to
 * `color`, and their values without a valid hex get one from the colour name. A name that
 * is not known is reported, never guessed. A product that already has a `color` option is
 * left as it is, because the two cannot share one code.
 */
import { COLOR_CODE, isColorOptionCode, isHexColor } from './color-option';

interface ColourOption {
  id: string;
  code: string;
  product: { name: string; options: Array<{ id: string; code: string }> };
  values: Array<{
    id: string;
    valueCode: string;
    displayName: string;
    metadata: unknown;
  }>;
}

interface Deps {
  prisma: {
    productOption: {
      findMany: (args: object) => PromiseLike<unknown>;
      update: (args: {
        where: { id: string };
        data: { code: string };
      }) => unknown;
    };
    productOptionValue: {
      update: (args: {
        where: { id: string };
        data: { metadata: Record<string, string> };
      }) => unknown;
    };
    $transaction: (operations: never[]) => PromiseLike<unknown>;
  };
  /** Hex code of a colour name, or undefined when the name is not known. */
  findHex: (name: string) => string | undefined;
}

export interface FixedColourOption {
  optionId: string;
  productName: string;
  /** True when the product already has a `color` option: nothing is changed. */
  skipped: boolean;
  filled: Array<{ valueId: string; name: string; hex: string }>;
  unknown: Array<{ valueId: string; name: string }>;
}

/**
 * The repair is for test data only. Judges the database name alone (not the password, host
 * or parameters of the URL) and has no override.
 */
export function assertTestDatabaseName(databaseUrl: string): string {
  let name = '';
  try {
    name = decodeURIComponent(new URL(databaseUrl).pathname.slice(1));
  } catch {
    // Not a URL: refused below.
  }
  if (!/test|e2e/i.test(name)) {
    throw new Error(
      `Refusing to repair database "${name || '(unknown)'}": this script only runs on a test or e2e database.`,
    );
  }
  return name;
}

function objectOf(metadata: unknown): Record<string, string> {
  return typeof metadata === 'object' &&
    metadata !== null &&
    !Array.isArray(metadata)
    ? (metadata as Record<string, string>)
    : {};
}

export async function fixColourOptions(
  { prisma, findHex }: Deps,
  { apply, productIds }: { apply: boolean; productIds?: string[] },
): Promise<{ options: FixedColourOption[] }> {
  const options = (await prisma.productOption.findMany({
    where: {
      code: { equals: 'colour', mode: 'insensitive' },
      ...(productIds && { productId: { in: productIds } }),
    },
    include: {
      product: {
        select: { name: true, options: { select: { id: true, code: true } } },
      },
      values: { orderBy: { sortOrder: 'asc' } },
    },
    orderBy: { id: 'asc' },
  })) as ColourOption[];

  const report: FixedColourOption[] = [];
  for (const option of options) {
    // Any other colour option, under either spelling, would end up with the same code.
    const skipped = option.product.options.some(
      (other) => other.id !== option.id && isColorOptionCode(other.code),
    );
    const entry: FixedColourOption = {
      optionId: option.id,
      productName: option.product.name,
      skipped,
      filled: [],
      unknown: [],
    };
    report.push(entry);
    if (skipped) continue;

    const writes: unknown[] = [];
    for (const value of option.values) {
      const metadata = objectOf(value.metadata);
      if (isHexColor(metadata.hex)) continue;
      const hex = findHex(value.displayName) ?? findHex(value.valueCode);
      if (!hex) {
        entry.unknown.push({ valueId: value.id, name: value.displayName });
        continue;
      }
      entry.filled.push({ valueId: value.id, name: value.displayName, hex });
      if (apply) {
        writes.push(
          prisma.productOptionValue.update({
            where: { id: value.id },
            data: { metadata: { ...metadata, hex } },
          }),
        );
      }
    }

    if (apply) {
      writes.push(
        prisma.productOption.update({
          where: { id: option.id },
          data: { code: COLOR_CODE },
        }),
      );
      // One option at a time, all or nothing.
      await prisma.$transaction(writes as never[]);
    }
  }

  return { options: report };
}
