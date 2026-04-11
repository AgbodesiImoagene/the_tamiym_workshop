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

export class CreateProductDto {
  @ApiProperty({ example: 'prod-cat-1' })
  @IsString()
  @IsNotEmpty()
  categoryId!: string;

  @ApiProperty({ example: 'Classic Cotton Tee' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'classic-cotton-tee', required: false })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  slug?: string;

  @ApiProperty({ example: 'Soft cotton t-shirt', required: false })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    enum: ProductStatus,
    default: ProductStatus.DRAFT,
    required: false,
  })
  @IsOptional()
  @IsEnum(ProductStatus)
  status?: ProductStatus = ProductStatus.DRAFT;

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
