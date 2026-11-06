import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Postgres stores the inclusive quantityRange with an exclusive upper bound, so
 * it adds 1 to maxQuantity. The largest integer has no room for that (TTW-163).
 */
export const BULK_TIER_MAX_QUANTITY = 2147483646;

const QUANTITY_TOO_LARGE = `$property must be ${BULK_TIER_MAX_QUANTITY} or less.`;

export class CreateBulkPricingDto {
  @ApiProperty()
  @IsString()
  productId!: string;

  @ApiPropertyOptional({
    description: 'Variant-specific tier; omit for product-level',
  })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiProperty({ example: 'NGN' })
  @IsString()
  currency!: string;

  @ApiProperty({
    example: 10,
    description: 'Minimum quantity for this tier',
    minimum: 1,
    maximum: BULK_TIER_MAX_QUANTITY,
  })
  @IsInt()
  @Min(1)
  @Max(BULK_TIER_MAX_QUANTITY, { message: QUANTITY_TOO_LARGE })
  @Type(() => Number)
  minQuantity!: number;

  @ApiPropertyOptional({
    example: 24,
    description: 'Maximum quantity (inclusive); omit for open-ended',
    minimum: 1,
    maximum: BULK_TIER_MAX_QUANTITY,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(BULK_TIER_MAX_QUANTITY, { message: QUANTITY_TOO_LARGE })
  @Type(() => Number)
  maxQuantity?: number;

  @ApiProperty({ example: 4500, description: 'Price per unit in this tier' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  pricePerUnit!: number;
}
