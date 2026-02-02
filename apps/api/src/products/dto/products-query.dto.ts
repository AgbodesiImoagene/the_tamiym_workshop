import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class ProductsQueryDto {
  @ApiProperty({
    example: 'cat-1',
    required: false,
    description: 'Filter by category ID',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiProperty({
    example: true,
    required: false,
    description: 'Filter by variant availability',
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  available?: boolean;
}
