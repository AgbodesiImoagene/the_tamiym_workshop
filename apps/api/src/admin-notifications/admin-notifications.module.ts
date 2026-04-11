import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AdminNotifyService } from './admin-notify.service';
import { AdminNotificationRoutesService } from './admin-notification-routes.service';
import { AdminNotificationRoutesController } from './admin-notification-routes.controller';
import { InventoryLowStockNotifier } from './inventory-low-stock.notifier';

@Module({
  imports: [PrismaModule, MailModule],
  controllers: [AdminNotificationRoutesController],
  providers: [
    AdminNotifyService,
    AdminNotificationRoutesService,
    InventoryLowStockNotifier,
  ],
  exports: [AdminNotifyService, InventoryLowStockNotifier],
})
export class AdminNotificationsModule {}
