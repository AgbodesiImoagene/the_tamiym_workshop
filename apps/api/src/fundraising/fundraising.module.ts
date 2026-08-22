import { Module } from '@nestjs/common';
import { CampaignsController } from './campaigns.controller';
import { PublicFundraisersController } from './public-fundraisers.controller';
import { PayoutProfilesController } from './payout-profiles.controller';
import { BanksController } from './banks.controller';
import { CampaignsService } from './campaigns.service';
import { CampaignExpiryService } from './campaign-expiry.service';
import { CampaignReadinessService } from './campaign-readiness.service';
import { PayoutProfilesService } from './payout-profiles.service';
import { PrismaModule } from '../prisma/prisma.module';
import { PricingModule } from '../pricing/pricing.module';
import { OrdersModule } from '../orders/orders.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { ModerationModule } from '../moderation/moderation.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { AuthModule } from '../auth/auth.module';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    PricingModule,
    OrdersModule,
    PayoutsModule,
    ModerationModule,
    AdminNotificationsModule,
    AuthModule,
    MailModule,
    NotificationsModule,
  ],
  controllers: [
    CampaignsController,
    PublicFundraisersController,
    PayoutProfilesController,
    BanksController,
  ],
  providers: [
    CampaignsService,
    CampaignExpiryService,
    CampaignReadinessService,
    PayoutProfilesService,
  ],
  exports: [CampaignsService, PayoutProfilesService, CampaignReadinessService],
})
export class FundraisingModule {}
