import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNotEmpty, IsObject } from 'class-validator';

export class CreateDesignDto {
  @ApiProperty({ example: 'My Tee Design' })
  @IsString()
  @IsNotEmpty()
  name!: string;

  @ApiProperty({ example: 'prod-1' })
  @IsString()
  @IsNotEmpty()
  productId!: string;

  @ApiProperty({
    description: 'Structured design data (version, views, layers per view)',
    example: { version: 1, productId: 'prod-1', views: {} },
  })
  @IsObject()
  designData!: Record<string, unknown>;

  @ApiProperty({
    example: 'https://cdn.example.com/thumb.png',
    required: false,
  })
  @IsOptional()
  @IsString()
  thumbnailUrl?: string;
}
