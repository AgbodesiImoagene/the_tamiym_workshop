import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  IsBoolean,
  IsNumber,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Sort order for product list. Price-based sort may be added later (e.g. raw query). */
export enum ProductSort {
  NEWEST = 'newest',
  OLDEST = 'oldest',
  NAME_ASC = 'name_asc',
  NAME_DESC = 'name_desc',
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class ProductsQueryDto {
  @ApiPropertyOptional({
    example: 'cat-1',
    description: 'Filter by category ID',
  })
  @IsOptional()
  @IsString()
  categoryId?: string;

  @ApiPropertyOptional({
    example: 'hoodies',
    description: 'Filter by category slug (ignored if categoryId is set)',
  })
  @IsOptional()
  @IsString()
  categorySlug?: string;

  @ApiPropertyOptional({
    example: true,
    description: 'Only products that have at least one available variant',
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  available?: boolean;

  @ApiPropertyOptional({
    example: 'tee',
    description:
      'Full-text search in product name and description (PostgreSQL FTS; multi-word matches any word)',
  })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({
    enum: ProductSort,
    default: ProductSort.NEWEST,
    description: 'Sort order for the list',
  })
  @IsOptional()
  @IsEnum(ProductSort)
  sort?: ProductSort;

  @ApiPropertyOptional({
    example: 1000,
    description: 'Minimum product base price (NGN)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  minPrice?: number;

  @ApiPropertyOptional({
    example: 15000,
    description: 'Maximum product base price (NGN)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  maxPrice?: number;

  @ApiPropertyOptional({
    example: true,
    description: 'Only products that have a compare-at price (on sale)',
  })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  onSale?: boolean;

  @ApiPropertyOptional({
    example: 20,
    default: DEFAULT_LIMIT,
    minimum: 1,
    maximum: MAX_LIMIT,
    description: 'Number of products to return',
  })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(MAX_LIMIT)
  @Type(() => Number)
  limit?: number;

  @ApiPropertyOptional({
    example: 0,
    default: 0,
    minimum: 0,
    description: 'Number of products to skip (for pagination)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  offset?: number;
}

export { DEFAULT_LIMIT, MAX_LIMIT };
