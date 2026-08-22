import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { NotificationDispatchService } from './notification-dispatch.service';
import { NotificationPreferenceService } from './notification-preference.service';
import { NotificationDeadLetterService } from './notification-dead-letter.service';
import { NotificationPreferencesController } from './notification-preferences.controller';
import { NotificationUnsubscribeController } from './notification-unsubscribe.controller';

@Module({
  imports: [PrismaModule, MailModule, ConfigModule],
  controllers: [
    NotificationPreferencesController,
    NotificationUnsubscribeController,
  ],
  providers: [
    NotificationDispatchService,
    NotificationPreferenceService,
    NotificationDeadLetterService,
  ],
  exports: [
    NotificationDispatchService,
    NotificationPreferenceService,
    NotificationDeadLetterService,
  ],
})
export class NotificationsModule {}
