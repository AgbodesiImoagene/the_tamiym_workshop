import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';
import { BullModule } from '@nestjs/bullmq';
import { join } from 'node:path';
import { MailService } from './mail.service';
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
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        transport: {
          host: config.get<string>('MAIL_HOST', 'localhost'),
          port: config.get<number>('MAIL_PORT', 1025),
          secure: config.get<string>('MAIL_SECURE') === 'true',
          auth:
            config.get<string>('MAIL_USER') &&
            config.get<string>('MAIL_PASSWORD')
              ? {
                  user: config.get<string>('MAIL_USER'),
                  pass: config.get<string>('MAIL_PASSWORD'),
                }
              : undefined,
        },
        defaults: {
          from: config.get<string>(
            'MAIL_FROM',
            '"Tamiym" <noreply@tamiym.com>',
          ),
        },
        template: {
          dir: join(__dirname, 'templates'),
          adapter: new HandlebarsAdapter(
            {
              formatAmount: (amount: unknown, currency: unknown) => {
                const cur =
                  typeof currency === 'string' && currency.length > 0
                    ? currency
                    : 'NGN';
                const n = typeof amount === 'number' ? amount : Number(amount);
                try {
                  return new Intl.NumberFormat('en-NG', {
                    style: 'currency',
                    currency: cur,
                  }).format(Number.isFinite(n) ? n : 0);
                } catch {
                  return `${cur} ${n}`;
                }
              },
            },
            { inlineCssEnabled: true },
          ),
          options: {
            partials: {
              dir: join(__dirname, 'templates', 'partials'),
            },
          },
        },
      }),
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
