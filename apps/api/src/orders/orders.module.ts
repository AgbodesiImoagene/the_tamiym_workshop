import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrdersController } from './orders.controller';
import { WebhooksController } from './webhooks.controller';
import { OrdersService } from './orders.service';
import { OrderExpiryService } from './order-expiry.service';
import { PaymentsService } from './payments.service';
import { PaystackWebhookService } from './paystack-webhook.service';
import { RefundsService } from './refunds.service';
import { PaystackTransactionClient } from './paystack-transaction.client';
import { PrismaModule } from '../prisma/prisma.module';
import { PricingModule } from '../pricing/pricing.module';
import { PayoutsModule } from '../payouts/payouts.module';
import { MailModule } from '../mail/mail.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    PricingModule,
    PayoutsModule,
    MailModule,
    AdminNotificationsModule,
  ],
  controllers: [OrdersController, WebhooksController],
  providers: [
    OrdersService,
    OrderExpiryService,
    PaymentsService,
    PaystackTransactionClient,
    PaystackWebhookService,
    RefundsService,
  ],
  exports: [OrdersService, PaymentsService, RefundsService],
})
export class OrdersModule {}
