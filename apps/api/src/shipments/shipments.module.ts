import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { MailModule } from '../mail/mail.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { ShipmentsService } from './shipments.service';

/**
 * Carrier-neutral shipment lifecycle (TTW-040).
 * Admin surface lives under AdminModule; customer summary is consumed by OrdersService.
 */
@Module({
  imports: [PrismaModule, MailModule, AdminNotificationsModule],
  providers: [ShipmentsService],
  exports: [ShipmentsService],
})
export class ShipmentsModule {}
