import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { SchedulerRegistry } from '@nestjs/schedule';
import { resolveApiRole, roleIncludes } from './api-role';

/**
 * Ensures cron jobs only run on the singleton scheduler (or `all`) role.
 * Feature modules may still declare `@Cron` providers; this strips them when
 * the process is api/worker-only so horizontal API/worker scale cannot
 * duplicate scheduled work.
 */
@Injectable()
export class SchedulerRoleBootstrap implements OnApplicationBootstrap {
  private readonly logger = new Logger(SchedulerRoleBootstrap.name);

  constructor(private readonly schedulerRegistry: SchedulerRegistry) {}

  onApplicationBootstrap(): void {
    const role = resolveApiRole();
    if (roleIncludes(role, 'scheduler')) {
      return;
    }

    const jobs = this.schedulerRegistry.getCronJobs();
    for (const name of [...jobs.keys()]) {
      this.schedulerRegistry.deleteCronJob(name);
      this.logger.log(
        `Disabled cron job "${name}" because API_ROLE=${role} is not scheduler-capable`,
      );
    }
  }
}
