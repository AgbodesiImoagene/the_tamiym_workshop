import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { OrdersController } from './orders.controller';
import { WebhooksController } from './webhooks.controller';
import { OrdersService } from './orders.service';
import { PaymentsService } from './payments.service';
import { PaystackWebhookService } from './paystack-webhook.service';
import { RefundsService } from './refunds.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, ConfigModule],
  controllers: [OrdersController, WebhooksController],
  providers: [
    OrdersService,
    PaymentsService,
    PaystackWebhookService,
    RefundsService,
  ],
  exports: [OrdersService, PaymentsService, RefundsService],
})
export class OrdersModule {}
