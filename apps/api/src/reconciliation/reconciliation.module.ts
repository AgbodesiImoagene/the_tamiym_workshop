import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { ReconciliationRunsService } from './reconciliation-runs.service';
import { ReconciliationRepairService } from './reconciliation-repair.service';
import { ReconciliationSchedulerService } from './reconciliation-scheduler.service';
import { PaystackReconciliationClient } from './paystack-reconciliation.client';

@Module({
  imports: [PrismaModule, AdminNotificationsModule, ConfigModule],
  providers: [
    PaystackReconciliationClient,
    ReconciliationRunsService,
    ReconciliationRepairService,
    ReconciliationSchedulerService,
  ],
  exports: [ReconciliationRunsService, ReconciliationRepairService],
})
export class ReconciliationModule {}
