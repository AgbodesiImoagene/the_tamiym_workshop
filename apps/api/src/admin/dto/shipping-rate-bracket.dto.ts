import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNumber, Max, Min } from 'class-validator';

/**
 * TTW-098: from `minValue` (grams or items, depending on the rate's
 * `bracketBasis`) the rate charges `fee` instead of its flat fee.
 */
export class ShippingRateBracketDto {
  @ApiProperty({
    example: 10,
    description:
      'Smallest total (grams or items) this bracket applies to, inclusive. Whole number, at least 1.',
  })
  @IsInt()
  @Min(1)
  @Max(2_000_000_000)
  minValue!: number;

  @ApiProperty({ example: 4000, description: 'Fee charged from `minValue`' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99_999_999)
  fee!: number;
}
