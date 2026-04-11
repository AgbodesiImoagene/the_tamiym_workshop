import { Module } from '@nestjs/common';
import { AdminOrdersController } from './admin-orders.controller';
import { AdminCategoriesController } from './admin-categories.controller';
import { AdminProductsController } from './admin-products.controller';
import { AdminInventoryController } from './admin-inventory.controller';
import { AdminDesignsController } from './admin-designs.controller';
import { AdminCampaignsController } from './admin-campaigns.controller';
import { AdminSiteSettingsController } from './admin-site-settings.controller';
import { AdminShippingController } from './admin-shipping.controller';
import { AdminPayoutsController } from './admin-payouts.controller';
import { AdminPayoutRunsController } from './admin-payout-runs.controller';
import { AdminManualPayoutsController } from './admin-manual-payouts.controller';
import { AdminDiscountsController } from './admin-discounts.controller';
import { AdminBulkPricingController } from './admin-bulk-pricing.controller';
import { OrdersModule } from '../orders/orders.module';
import { DiscountsModule } from '../discounts/discounts.module';
import { BulkPricingModule } from '../bulk-pricing/bulk-pricing.module';
import { ProductsModule } from '../products/products.module';
import { InventoryModule } from '../inventory/inventory.module';
import { DesignsModule } from '../designs/designs.module';
import { FundraisingModule } from '../fundraising/fundraising.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminEmailBroadcastService } from './admin-email-broadcast.service';
import { ShippingModule } from '../shipping/shipping.module';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    AdminNotificationsModule,
    DiscountsModule,
    BulkPricingModule,
    OrdersModule,
    ProductsModule,
    InventoryModule,
    DesignsModule,
    FundraisingModule,
    PayoutsModule,
    ShippingModule,
  ],
  providers: [AdminEmailBroadcastService],
  controllers: [
    AdminOrdersController,
    AdminCategoriesController,
    AdminProductsController,
    AdminInventoryController,
    AdminDesignsController,
    AdminCampaignsController,
    AdminSiteSettingsController,
    AdminShippingController,
    AdminPayoutsController,
    AdminPayoutRunsController,
    AdminManualPayoutsController,
    AdminDiscountsController,
    AdminBulkPricingController,
    AdminNotificationsController,
  ],
})
export class AdminModule {}
