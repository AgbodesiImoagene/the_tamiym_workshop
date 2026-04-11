import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

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

  @ApiProperty({ example: 10, description: 'Minimum quantity for this tier' })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  minQuantity!: number;

  @ApiPropertyOptional({
    example: 24,
    description: 'Maximum quantity (inclusive); omit for open-ended',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  maxQuantity?: number;

  @ApiProperty({ example: 4500, description: 'Price per unit in this tier' })
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  pricePerUnit!: number;
}
