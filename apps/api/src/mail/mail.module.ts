import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MailerModule } from '@nestjs-modules/mailer';
import { BullModule } from '@nestjs/bullmq';
import { MailService } from './mail.service';
import { MailProcessor } from './processors/mail.processor';
import { MAIL_QUEUE_NAME } from '../constants';

@Module({
  imports: [
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
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: MAIL_QUEUE_NAME,
    }),
  ],
  providers: [MailService, MailProcessor],
  exports: [MailService, BullModule],
})
export class MailModule {}
