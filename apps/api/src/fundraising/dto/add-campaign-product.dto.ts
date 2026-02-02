import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, IsNumber } from 'class-validator';
import { Type } from 'class-transformer';

export class AddCampaignProductDto {
  @ApiProperty({ example: 'prod-1' })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({ example: 'design-1', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  designId?: string;

  @ApiProperty({
    example: 15000,
    required: false,
    description: 'Campaign selling price (NGN)',
  })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  price?: number;
}
