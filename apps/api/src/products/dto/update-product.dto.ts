import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNotEmpty,
  IsEnum,
  IsInt,
  Min,
} from 'class-validator';
import { ProductStatus } from '../../generated/prisma/enums';

export class UpdateProductDto {
  @ApiProperty({ example: 'prod-cat-1', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  categoryId?: string;

  @ApiProperty({ example: 'Classic Cotton Tee', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @ApiProperty({ example: 'classic-cotton-tee', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  slug?: string;

  @ApiProperty({ example: 'Soft cotton t-shirt', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ enum: ProductStatus, required: false })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus;

  @ApiProperty({ example: 300, required: false })
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
