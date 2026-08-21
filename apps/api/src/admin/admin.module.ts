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
import { AuthModule } from '../auth/auth.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { AdminNotificationsController } from './admin-notifications.controller';
import { AdminEmailBroadcastService } from './admin-email-broadcast.service';
import { AdminUsersController } from './admin-users.controller';
import { AdminUsersService } from './admin-users.service';
import { AdminMediaController } from './admin-media.controller';
import { AdminModerationAppealsController } from './admin-moderation-appeals.controller';
import { AdminOrganizerApplicationsController } from './admin-organizer-applications.controller';
import { ShippingModule } from '../shipping/shipping.module';
import { ReconciliationModule } from '../reconciliation/reconciliation.module';
import { AdminReconciliationController } from './admin-reconciliation.controller';
import { MediaModule } from '../media/media.module';
import { ModerationModule } from '../moderation/moderation.module';
import { OrganizerModule } from '../organizer/organizer.module';
import { ShipmentsModule } from '../shipments/shipments.module';
import { AdminShipmentsController } from './admin-shipments.controller';

@Module({
  imports: [
    PrismaModule,
    MailModule,
    AuthModule,
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
    ReconciliationModule,
    MediaModule,
    ModerationModule,
    OrganizerModule,
    ShipmentsModule,
  ],
  providers: [AdminEmailBroadcastService, AdminUsersService],
  controllers: [
    AdminOrdersController,
    AdminShipmentsController,
    AdminCategoriesController,
    AdminProductsController,
    AdminInventoryController,
    AdminDesignsController,
    AdminCampaignsController,
    AdminMediaController,
    AdminModerationAppealsController,
    AdminOrganizerApplicationsController,
    AdminSiteSettingsController,
    AdminShippingController,
    AdminPayoutsController,
    AdminPayoutRunsController,
    AdminManualPayoutsController,
    AdminDiscountsController,
    AdminBulkPricingController,
    AdminNotificationsController,
    AdminReconciliationController,
    AdminUsersController,
  ],
})
export class AdminModule {}
