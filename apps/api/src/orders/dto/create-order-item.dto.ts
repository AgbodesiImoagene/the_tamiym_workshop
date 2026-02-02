import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateOrderItemDto {
  @ApiProperty({ example: 'prod-1' })
  @IsString()
  @IsNotEmpty()
  productId!: string;

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
