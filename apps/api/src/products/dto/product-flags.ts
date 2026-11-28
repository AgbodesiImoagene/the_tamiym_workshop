import { applyDecorators } from '@nestjs/common';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsBoolean, ValidateIf } from 'class-validator';

/**
 * TTW-267: an optional boolean on a product write. Only `true` and `false` are
 * accepted: the global pipe converts types implicitly, which would turn the
 * string "false" into `true`, so the value is read back as it was sent. `null`
 * is refused because the column is not nullable.
 */
export function IsOptionalProductFlag() {
  return applyDecorators(
    Transform(
      ({ obj, key }: TransformFnParams) =>
        (obj as Record<string, unknown>)[key],
    ),
    ValidateIf((_, value) => value !== undefined),
    IsBoolean(),
  );
}

/** Swagger descriptions of the two flags, shared by writes and reads. */
export const PRODUCT_FLAG_SCHEMA = {
  isBestSeller: {
    type: 'boolean',
    description:
      'Shows the "Best Seller" badge on the product card. Set by an admin, not computed from sales.',
  },
  expressProduction: {
    type: 'boolean',
    description:
      'Shows the "2-Day Express Production Available" tag on the product card. Display only: it changes no price or delivery time.',
  },
} as const;
