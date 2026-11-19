import { applyDecorators } from '@nestjs/common';
import {
  IsNotEmpty,
  IsString,
  MaxLength,
  ValidateBy,
  buildMessage,
} from 'class-validator';

/** True unless the value is a string that contains a NUL character (U+0000). */
function hasNoNul(value: unknown): boolean {
  return typeof value !== 'string' || !value.includes('\0');
}

/**
 * TTW-226: the one rule for a free-text address field. It must be a non-empty
 * string of at most `max` characters and must not contain a NUL character
 * (U+0000), which Postgres cannot store (it would answer 500 instead of 400).
 * Combine with `@IsOptional()` for an optional field.
 */
export function AddressText(max: number) {
  return applyDecorators(
    IsString(),
    IsNotEmpty(),
    MaxLength(max),
    ValidateBy({
      name: 'hasNoNul',
      validator: {
        validate: hasNoNul,
        defaultMessage: buildMessage(
          (eachPrefix) =>
            `${eachPrefix}$property must not contain a NUL character`,
        ),
      },
    }),
  );
}
