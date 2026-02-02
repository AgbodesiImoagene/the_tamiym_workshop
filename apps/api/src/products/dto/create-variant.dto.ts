import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateVariantDto {
  @ApiProperty({ example: 'Small / Red' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'SKU-TEE-S-RED' })
  @IsString()
  @IsNotEmpty()
  sku!: string;

  @ApiProperty({ example: 'S', required: false })
  @IsOptional()
  @IsString()
  size?: string;

  @ApiProperty({ example: 'Red', required: false })
  @IsOptional()
  @IsString()
  color?: string;

  @ApiProperty({ example: 5000.5, required: false })
  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  priceOverride?: number;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;
}
