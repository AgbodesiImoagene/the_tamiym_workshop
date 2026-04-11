import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsString } from 'class-validator';

export class UpdateProductImageDto {
  @ApiProperty({ example: 0, required: false })
  @IsOptional()
  @IsInt()
  sortOrder?: number;

  @ApiProperty({ example: 'Front view', required: false })
  @IsOptional()
  @IsString()
  altText?: string;

  @ApiProperty({ example: 'variant-id', required: false })
  @IsOptional()
  @IsString()
  variantId?: string;

  @ApiProperty({ example: 'media-asset-id', required: false })
  @IsOptional()
  @IsString()
  mediaAssetId?: string;
}
