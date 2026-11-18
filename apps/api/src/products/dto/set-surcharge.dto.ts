import { ApiProperty } from '@nestjs/swagger';
import {
  IsNumber,
  Max,
  Min,
  registerDecorator,
  type ValidationOptions,
} from 'class-validator';

/** Largest value that fits the `Decimal(10, 2)` columns. */
export const MAX_SURCHARGE_AMOUNT = 99_999_999.99;

/**
 * A number that is exactly its own 2-decimal form (500, 1000.5, 0.3).
 *
 * `IsNumber({ maxDecimalPlaces })` is not used: for a value written in
 * exponent form such as 1e-7 it throws a TypeError, which surfaces as a 500
 * instead of a 400. It also refuses float drift such as 0.1 + 0.2.
 */
function HasAtMostTwoDecimals(options?: ValidationOptions) {
  return (target: object, propertyName: string) => {
    registerDecorator({
      name: 'hasAtMostTwoDecimals',
      target: target.constructor,
      propertyName,
      options: {
        message: 'amount must have at most 2 decimal places',
        ...options,
      },
      validator: {
        validate: (value: unknown) =>
          typeof value === 'number' &&
          Number.isFinite(value) &&
          Number(value.toFixed(2)) === value,
      },
    });
  };
}

/** Body of the size-upcharge and print-side-surcharge PUT routes (TTW-094). */
export class SetSurchargeDto {
  @ApiProperty({
    example: 500,
    minimum: 0,
    maximum: MAX_SURCHARGE_AMOUNT,
    description:
      'Extra amount in the currency of the route, at most 2 decimals. Use DELETE to remove the surcharge.',
  })
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @HasAtMostTwoDecimals()
  @Min(0)
  @Max(MAX_SURCHARGE_AMOUNT)
  amount!: number;
}
