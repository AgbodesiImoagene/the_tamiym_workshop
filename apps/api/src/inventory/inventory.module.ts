import { Module } from '@nestjs/common';
import { InventoryController } from './inventory.controller';
import { InventoryService } from './inventory.service';
import { InventoryLifecycleService } from './inventory-lifecycle.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { ObservabilityModule } from '../observability/observability.module';

@Module({
  imports: [PrismaModule, AdminNotificationsModule, ObservabilityModule],
  controllers: [InventoryController],
  providers: [InventoryService, InventoryLifecycleService],
  exports: [InventoryService, InventoryLifecycleService],
})
export class InventoryModule {}
