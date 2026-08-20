import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { MailService } from './mail.service';
import { MailTransportService } from './mail-transport.service';
import { MailProcessor } from './processors/mail.processor';
import { MAIL_QUEUE_NAME } from '../constants';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationOutboxDeliveryService } from './notification-outbox-delivery.service';
import { NotificationOutboxBackfillService } from './notification-outbox-backfill.service';
import { SmsService } from './sms.service';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    BullModule.registerQueue({
      name: MAIL_QUEUE_NAME,
      defaultJobOptions: {
        attempts: 8,
        backoff: { type: 'exponential', delay: 4000 },
        removeOnComplete: true,
        removeOnFail: { count: 200 },
      },
    }),
  ],
  providers: [
    MailTransportService,
    MailService,
    SmsService,
    MailProcessor,
    NotificationOutboxDeliveryService,
    NotificationOutboxBackfillService,
  ],
  exports: [MailService, BullModule, NotificationOutboxDeliveryService],
})
export class MailModule {}
