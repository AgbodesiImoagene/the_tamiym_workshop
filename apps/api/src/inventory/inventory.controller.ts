import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { InventoryService } from './inventory.service';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('Products')
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventoryService: InventoryService) {}

  /**
   * Get inventory for a variant (public read)
   */
  @Get('variant/:variantId')
  @Public()
  @ApiOperation({ summary: 'Get inventory for a variant' })
  @ApiParam({ name: 'variantId', description: 'Product variant ID' })
  @ApiResponse({
    status: 200,
    description: 'Variant inventory (stock, reserved, lowStockThreshold)',
    schema: {
      type: 'object',
      properties: {
        variantId: { type: 'string' },
        variantName: { type: 'string' },
        sku: { type: 'string' },
        isAvailable: { type: 'boolean' },
        product: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
            slug: { type: 'string' },
          },
        },
        inventory: {
          type: 'object',
          properties: {
            stockOnHand: { type: 'number' },
            reserved: { type: 'number' },
            trackInventory: { type: 'boolean' },
            lowStockThreshold: { type: 'number' },
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Variant not found' })
  getByVariantId(@Param('variantId') variantId: string) {
    return this.inventoryService.getByVariantId(variantId);
  }
}
