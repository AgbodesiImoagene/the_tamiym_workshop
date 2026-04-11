import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsBoolean,
  IsInt,
  Min,
} from 'class-validator';

export class UpdateVariantDto {
  @ApiProperty({ example: 'Small / Red', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiProperty({ example: 'SKU-TEE-S-RED', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  sku?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @IsBoolean()
  isAvailable?: boolean;

  @ApiProperty({ example: 320, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  weightGrams?: number;

  @ApiProperty({ example: 320, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  packageLengthMm?: number;

  @ApiProperty({ example: 240, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  packageWidthMm?: number;

  @ApiProperty({ example: 40, required: false })
  @IsOptional()
  @IsInt()
  @Min(0)
  packageHeightMm?: number;
}
