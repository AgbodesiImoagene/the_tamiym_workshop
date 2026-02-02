import { Module } from '@nestjs/common';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminProductsController } from './admin-products.controller';
import { AdminInventoryController } from './admin-inventory.controller';
import { AdminDesignsController } from './admin-designs.controller';
import { AdminCampaignsController } from './admin-campaigns.controller';
import { OrdersModule } from '../orders/orders.module';
import { ProductsModule } from '../products/products.module';
import { InventoryModule } from '../inventory/inventory.module';
import { DesignsModule } from '../designs/designs.module';
import { FundraisingModule } from '../fundraising/fundraising.module';

@Module({
  imports: [
    OrdersModule,
    ProductsModule,
    InventoryModule,
    DesignsModule,
    FundraisingModule,
  ],
  controllers: [
    AdminOrdersController,
    AdminCategoriesController,
    AdminProductsController,
    AdminInventoryController,
    AdminDesignsController,
    AdminCampaignsController,
  ],
})
export class AdminModule {}
