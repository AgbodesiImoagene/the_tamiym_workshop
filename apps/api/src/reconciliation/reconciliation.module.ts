import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { AdminNotificationsModule } from '../admin-notifications/admin-notifications.module';
import { ReconciliationRunsService } from './reconciliation-runs.service';
import { ReconciliationRepairService } from './reconciliation-repair.service';
import { ReconciliationSchedulerService } from './reconciliation-scheduler.service';

@Module({
  imports: [PrismaModule, AdminNotificationsModule],
  providers: [
    ReconciliationRunsService,
    ReconciliationRepairService,
    ReconciliationSchedulerService,
  ],
  exports: [ReconciliationRunsService, ReconciliationRepairService],
})
export class ReconciliationModule {}
