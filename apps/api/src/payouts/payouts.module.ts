import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { PayoutsService } from './payouts.service';
import { CampaignLedgerService } from './campaign-ledger.service';
import { PayoutRunsService } from './payout-runs.service';
import { PayoutRunSchedulerService } from './payout-run-scheduler.service';
import { PayoutExecutionProcessor } from './payout-execution.processor';
import { PaystackTransferProviderService } from './paystack-transfer.provider';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { PAYOUT_QUEUE_NAME } from '../constants';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    MailModule,
    AdminNotificationsModule,
    BullModule.registerQueue({ name: PAYOUT_QUEUE_NAME }),
  ],
  providers: [
    PayoutsService,
    CampaignLedgerService,
    PayoutRunsService,
    PayoutRunSchedulerService,
    PayoutExecutionProcessor,
    PaystackTransferProviderService,
  ],
  exports: [
    PayoutsService,
    CampaignLedgerService,
    PayoutRunsService,
    PaystackTransferProviderService,
  ],
})
export class PayoutsModule {}
