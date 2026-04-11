import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { DiscountScope, DiscountType } from '../../generated/prisma/enums';

export class CreateDiscountDto {
  @ApiPropertyOptional({ example: 'SAVE10' })
  @IsOptional()
  @IsString()
  code?: string;

  @ApiProperty({ enum: DiscountType })
  @IsEnum(DiscountType)
  type!: string;

  @ApiProperty({ enum: DiscountScope })
  @IsEnum(DiscountScope)
  scope!: string;

  @ApiPropertyOptional({ enum: ['ACTIVE', 'INACTIVE'], default: 'ACTIVE' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ description: 'For PERCENTAGE: 0–100', example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @Type(() => Number)
  valuePercent?: number;

  @ApiPropertyOptional({
    description: 'For FIXED: amount; requires currency',
    example: 500,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  valueAmount?: number;

  @ApiPropertyOptional({
    description: 'Required when type is FIXED',
    example: 'NGN',
  })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minOrderAmount?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  startAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  endAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxRedemptions?: number;

  @ApiPropertyOptional({
    description: 'Campaign IDs when scope is CAMPAIGN',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  campaignIds?: string[];

  @ApiPropertyOptional({
    description: 'Product IDs when scope is PRODUCT',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  productIds?: string[];

  @ApiPropertyOptional({
    description: 'Variant IDs when scope is VARIANT',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  variantIds?: string[];
}
