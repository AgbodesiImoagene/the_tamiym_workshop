import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { PublicFundraisersController } from './public-fundraisers.controller';
import { PayoutProfilesController } from './payout-profiles.controller';
import { BanksController } from './banks.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignExpiryService } from './campaign-expiry.service';
import { PayoutProfilesService } from './payout-profiles.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PricingModule } from '../pricing/pricing.module';
import { OrdersModule } from '../orders/orders.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { ModerationModule } from '../moderation/moderation.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    PrismaModule,
    PricingModule,
    OrdersModule,
    PayoutsModule,
    ModerationModule,
    AdminNotificationsModule,
    AuthModule,
  ],
  controllers: [
    CampaignsController,
    PublicFundraisersController,
    PayoutProfilesController,
    BanksController,
  ],
  providers: [CampaignsService, CampaignExpiryService, PayoutProfilesService],
  exports: [CampaignsService, PayoutProfilesService],
})
export class FundraisingModule {}
