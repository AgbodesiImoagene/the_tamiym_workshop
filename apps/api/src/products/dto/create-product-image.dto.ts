import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateProductImageDto {
  @ApiProperty({
    example: 'https://cdn.example.com/img.png',
    description: 'Source URL to import asynchronously',
  })
  @IsString()
  @IsNotEmpty()
  sourceUrl!: string;

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
}
