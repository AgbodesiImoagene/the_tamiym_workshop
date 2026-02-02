import { Controller, Get, Param, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { ProductsQueryDto } from './dto/products-query.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * List products (public). Optional filters: category, availability.
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'List products' })
  @ApiQuery({
    name: 'categoryId',
    required: false,
    description: 'Filter by category ID',
  })
  @ApiQuery({
    name: 'available',
    required: false,
    description: 'Filter by variant availability',
    type: Boolean,
  })
  @ApiResponse({
    status: 200,
    description: 'List of products with variants and prices',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          slug: { type: 'string' },
          description: { type: 'string', nullable: true },
          status: { type: 'string' },
          category: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              slug: { type: 'string' },
            },
          },
          variants: { type: 'array' },
          prices: { type: 'array' },
        },
      },
    },
  })
  findAll(@Query() query: ProductsQueryDto) {
    return this.productsService.findAll(query);
  }

  /**
   * Get a product by ID (public). Includes variants and prices.
   */
  @Get(':id')
  @Public()
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({
    status: 200,
    description: 'Product with variants and prices',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        slug: { type: 'string' },
        description: { type: 'string', nullable: true },
        status: { type: 'string' },
        category: { type: 'object' },
        variants: { type: 'array' },
        prices: { type: 'array' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }
}
