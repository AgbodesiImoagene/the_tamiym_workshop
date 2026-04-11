import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateProductImageUploadDto {
  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsInt()
  @Type(() => Number)
  sortOrder?: number;

  @ApiProperty({ example: 'Front view', required: false })
  @IsOptional()
  @IsString()
  altText?: string;

  @ApiProperty({ example: 'variant-id', required: false })
  @IsOptional()
  @IsString()
  variantId?: string;
}
