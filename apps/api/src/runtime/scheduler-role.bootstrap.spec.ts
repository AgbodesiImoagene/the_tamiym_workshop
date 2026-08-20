import { SchedulerRegistry } from '@nestjs/schedule';
import { SchedulerRoleBootstrap } from './scheduler-role.bootstrap';

describe('SchedulerRoleBootstrap', () => {
  const original = process.env.API_ROLE;

  afterEach(() => {
    if (original === undefined) {
      delete process.env.API_ROLE;
    } else {
      process.env.API_ROLE = original;
    }
  });

  function build(jobs: Map<string, unknown>) {
    const deleteCronJob = jest.fn((name: string) => {
      jobs.delete(name);
    });
    const registry = {
      getCronJobs: () => jobs,
      deleteCronJob,
    } as unknown as SchedulerRegistry;
    return {
      bootstrap: new SchedulerRoleBootstrap(registry),
      deleteCronJob,
      jobs,
    };
  }

  it('keeps cron jobs for scheduler role', () => {
    process.env.API_ROLE = 'scheduler';
    const jobs = new Map<string, unknown>([['nightly', {}]]);
    const { bootstrap, deleteCronJob } = build(jobs);
    bootstrap.onApplicationBootstrap();
    expect(deleteCronJob).not.toHaveBeenCalled();
    expect(jobs.has('nightly')).toBe(true);
  });

  it('disables cron jobs for api role', () => {
    process.env.API_ROLE = 'api';
    const jobs = new Map<string, unknown>([
      ['nightly', {}],
      ['hourly', {}],
    ]);
    const { bootstrap, deleteCronJob } = build(jobs);
    bootstrap.onApplicationBootstrap();
    expect(deleteCronJob).toHaveBeenCalledTimes(2);
    expect(jobs.size).toBe(0);
  });

  it('keeps cron jobs for all role', () => {
    process.env.API_ROLE = 'all';
    const jobs = new Map<string, unknown>([['nightly', {}]]);
    const { bootstrap, deleteCronJob } = build(jobs);
    bootstrap.onApplicationBootstrap();
    expect(deleteCronJob).not.toHaveBeenCalled();
  });
});
