import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { BullModule } from '@nestjs/bullmq';
import { MailService } from './mail.service';
import { MailProcessor } from './processors/mail.processor';
import { MAIL_QUEUE_NAME } from '../constants';
import { PrismaModule } from '../prisma/prisma.module';
import { NotificationOutboxDeliveryService } from './notification-outbox-delivery.service';
import { NotificationOutboxBackfillService } from './notification-outbox-backfill.service';
import { SmsService } from './sms.service';
import { buildMailerModuleOptions } from './mail-template.factory';

@Module({
  imports: [
    ConfigModule,
    PrismaModule,
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: buildMailerModuleOptions,
      inject: [ConfigService],
    }),
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
    MailService,
    SmsService,
    MailProcessor,
    NotificationOutboxDeliveryService,
    NotificationOutboxBackfillService,
  ],
  exports: [MailService, BullModule, NotificationOutboxDeliveryService],
})
export class MailModule {}
