import { applyDecorators } from '@nestjs/common';
import { Transform, TransformFnParams } from 'class-transformer';
import { IsBoolean, ValidateIf } from 'class-validator';

/**
 * TTW-274: boolean fields of requests. Use these instead of a bare `IsBoolean`
 * validator: the global pipe converts types implicitly before validating, so the
 * validator alone sees `Boolean(value)` and would accept the string "false" as
 * `true`.
 */

const asSent = ({ obj, key }: TransformFnParams): unknown =>
  (obj as Record<string, unknown>)[key];

const isPresent = (_: object, value: unknown) => value !== undefined;

/** A required body flag: only `true` and `false`. */
export function IsStrictBoolean() {
  return applyDecorators(Transform(asSent), IsBoolean());
}

/**
 * A body flag that may be left out. `null` is refused: none of these fields has
 * an empty state.
 */
export function IsOptionalStrictBoolean() {
  return applyDecorators(ValidateIf(isPresent), IsStrictBoolean());
}

/**
 * A query-string flag that may be left out. A query string only carries text, so
 * exactly "true" and "false" are read as booleans.
 */
export function IsOptionalQueryBoolean() {
  return applyDecorators(
    ValidateIf(isPresent),
    Transform((params) => {
      const value = asSent(params);
      if (value === 'true') return true;
      if (value === 'false') return false;
      return value;
    }),
    IsBoolean(),
  );
}
