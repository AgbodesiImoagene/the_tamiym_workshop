import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { ProductsQueryDto } from './dto/products-query.dto';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Products')
@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  /**
   * List products (public). Slim catalogue response: category, base price (NGN), thumbnail.
   * Supports filters: category (id or slug), availability, search, price range, on-sale; sort and pagination.
   */
  @Get()
  @Public()
  @ApiOperation({ summary: 'List products (catalogue)' })
  @ApiResponse({
    status: 200,
    description:
      'List of products with category, prices (NGN), and thumbnail (no variants)',
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
          prices: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                amount: { type: 'number' },
                currency: { type: 'string' },
                compareAt: { type: 'number', nullable: true },
              },
            },
          },
          productImageRoles: {
            type: 'array',
            description: 'At most one thumbnail',
            items: {
              type: 'object',
              properties: {
                image: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    url: { type: 'string' },
                    altText: { type: 'string', nullable: true },
                  },
                },
              },
            },
          },
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
        variants: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              name: { type: 'string' },
              sku: { type: 'string' },
              isAvailable: { type: 'boolean' },
              inStock: { type: 'boolean' },
              availableQuantity: { type: 'number', nullable: true },
              resolvedPrice: { type: 'number', nullable: true },
              resolvedCompareAt: { type: 'number', nullable: true },
              resolvedCurrency: { type: 'string' },
              optionValues: { type: 'array' },
              prices: { type: 'array' },
            },
          },
        },
        prices: { type: 'array' },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findOne(@Param('id') id: string) {
    return this.productsService.findOne(id);
  }

  /**
   * Workshop context for a product (public). Returns everything the Design Workshop editor
   * needs to initialise: options, views, print areas, template layers, and option-value effects.
   */
  @Get(':id/workshop')
  @Public()
  @ApiOperation({ summary: 'Get Design Workshop context for a product' })
  @ApiParam({ name: 'id', description: 'Product ID' })
  @ApiResponse({
    status: 200,
    description:
      'Workshop context: product metadata, options, views with print areas, template layers, and effects',
    schema: {
      type: 'object',
      properties: {
        product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
            options: { type: 'array' },
          },
        },
        views: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              key: { type: 'string' },
              displayName: { type: 'string' },
              sortOrder: { type: 'number' },
              isDesignable: { type: 'boolean' },
              isDefault: { type: 'boolean' },
              printArea: { type: 'object', nullable: true },
              templateLayers: { type: 'array' },
              effects: { type: 'array' },
            },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Product not found' })
  getWorkshop(@Param('id') id: string) {
    return this.productsService.getWorkshopContext(id);
  }
}
