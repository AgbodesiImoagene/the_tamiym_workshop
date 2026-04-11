import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Single line item for a quote request. Variant is the source of truth; product is derived from the variant.
 */
export class QuoteItemDto {
  @ApiProperty({ example: 'var-1' })
  @IsString()
  @IsNotEmpty()
  variantId!: string;

  @ApiProperty({ example: 'design-1', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  designId?: string;

  @ApiProperty({ example: 'campaign-1', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  campaignId?: string;

  @ApiProperty({ example: 2, minimum: 1 })
  @IsInt()
  @Min(1)
  @Type(() => Number)
  quantity!: number;
}
