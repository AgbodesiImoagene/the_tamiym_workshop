import { Logger } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { MailProcessor } from './mail.processor';
import { MailService } from '../mail.service';
import { ObservabilityService } from '../../observability/observability.service';
import { NotificationOutboxDeliveryService } from '../notification-outbox-delivery.service';
import {
  JOB_GOOGLE_LINKED_ACCOUNT_SUSPENDED_EMAIL,
  JOB_GOOGLE_LINKED_PASSWORD_REMOVED_EMAIL,
  JOB_NOTIFICATION_OUTBOX,
  JOB_PASSWORD_RESET_EMAIL,
  JOB_VERIFICATION_EMAIL,
} from '../../constants';

describe('MailProcessor', () => {
  let processor: MailProcessor;
  let mailService: jest.Mocked<
    Pick<
      MailService,
      | 'sendVerificationEmail'
      | 'sendPasswordResetEmail'
      | 'sendGoogleLinkedPasswordRemovedEmail'
      | 'sendGoogleLinkedAccountSuspendedEmail'
    >
  >;
  let delivery: jest.Mocked<
    Pick<NotificationOutboxDeliveryService, 'deliverOutbox'>
  >;
  let observability: jest.Mocked<Pick<ObservabilityService, 'recordQueueJob'>>;

  beforeEach(async () => {
    mailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
      sendGoogleLinkedPasswordRemovedEmail: jest
        .fn()
        .mockResolvedValue(undefined),
      sendGoogleLinkedAccountSuspendedEmail: jest
        .fn()
        .mockResolvedValue(undefined),
    };
    delivery = {
      deliverOutbox: jest.fn().mockResolvedValue(undefined),
    };
    observability = {
      recordQueueJob: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MailProcessor,
        { provide: MailService, useValue: mailService },
        { provide: ObservabilityService, useValue: observability },
        { provide: NotificationOutboxDeliveryService, useValue: delivery },
      ],
    }).compile();

    processor = module.get(MailProcessor);
  });

  function makeJob(
    name: string,
    data: object,
    extra: { attemptsMade?: number; opts?: object } = {},
  ): Job {
    return {
      name,
      data,
      id: 'job-1',
      attemptsMade: extra.attemptsMade ?? 0,
      opts: extra.opts ?? { attempts: 8 },
    } as unknown as Job;
  }

  it('sends verification email without logging the address (TTW-184)', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await processor.process(
      makeJob(JOB_VERIFICATION_EMAIL, {
        to: 'a@b.com',
        verifyUrl: 'http://x/verify',
      }),
    );
    expect(mailService.sendVerificationEmail).toHaveBeenCalledWith({
      to: 'a@b.com',
      verifyUrl: 'http://x/verify',
    });
    expect(observability.recordQueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'success' }),
    );
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain('a@b.com');
    log.mockRestore();
  });

  it('sends password reset email without logging the address (TTW-184)', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await processor.process(
      makeJob(JOB_PASSWORD_RESET_EMAIL, {
        to: 'a@b.com',
        resetUrl: 'http://x/reset',
      }),
    );
    expect(mailService.sendPasswordResetEmail).toHaveBeenCalled();
    expect(observability.recordQueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'success' }),
    );
    expect(log).toHaveBeenCalled();
    expect(JSON.stringify(log.mock.calls)).not.toContain('a@b.com');
    log.mockRestore();
  });

  describe('final failure of a token-bearing job (TTW-184)', () => {
    const ADDRESS = 'owner@example.com';
    const RAW_TOKEN = 'RAW-TOKEN-0123456789';
    const LINK = `http://x/reset-password?token=${RAW_TOKEN}`;
    let warn: jest.SpyInstance;

    function failingSend(): Error {
      // Messages can carry the address or the link: none of it may be logged.
      return Object.assign(
        new Error(`Invalid email address: ${ADDRESS} (${LINK})`),
        { code: 'EENVELOPE' },
      );
    }

    beforeEach(() => {
      warn = jest
        .spyOn(Logger.prototype, 'warn')
        .mockImplementation(() => undefined);
      mailService.sendVerificationEmail.mockRejectedValue(failingSend());
      mailService.sendPasswordResetEmail.mockRejectedValue(failingSend());
      mailService.sendGoogleLinkedAccountSuspendedEmail.mockRejectedValue(
        failingSend(),
      );
    });

    afterEach(() => warn.mockRestore());

    it.each([
      [JOB_PASSWORD_RESET_EMAIL, { to: ADDRESS, resetUrl: LINK }],
      [JOB_VERIFICATION_EMAIL, { to: ADDRESS, verifyUrl: LINK }],
    ])(
      'logs a warning for %s without the address, link, token or error message, then rethrows',
      async (name, data) => {
        await expect(
          processor.process(
            makeJob(name, data, {
              attemptsMade: 7,
              opts: { attempts: 8, removeOnFail: true },
            }),
          ),
        ).rejects.toThrow('Invalid email address');

        expect(warn).toHaveBeenCalledTimes(1);
        const logged = JSON.stringify(warn.mock.calls);
        expect(logged).toContain(name);
        expect(logged).toContain('job-1');
        expect(logged).toContain('8 attempts');
        expect(logged).toContain('EENVELOPE');
        expect(logged).not.toContain(ADDRESS);
        expect(logged).not.toContain(RAW_TOKEN);
        expect(logged).not.toContain('http://x');
        expect(logged).not.toContain('Invalid email address');
        expect(observability.recordQueueJob).toHaveBeenCalledWith(
          expect.objectContaining({ jobName: name, outcome: 'failure' }),
        );
      },
    );

    it('treats a job with no attempts option as on its final attempt', async () => {
      await expect(
        processor.process(
          makeJob(
            JOB_PASSWORD_RESET_EMAIL,
            { to: ADDRESS, resetUrl: LINK },
            { attemptsMade: 0, opts: {} },
          ),
        ),
      ).rejects.toThrow();

      expect(warn).toHaveBeenCalledTimes(1);
    });

    it('does not log the final warning while retries remain', async () => {
      await expect(
        processor.process(
          makeJob(
            JOB_PASSWORD_RESET_EMAIL,
            { to: ADDRESS, resetUrl: LINK },
            { attemptsMade: 6, opts: { attempts: 8 } },
          ),
        ),
      ).rejects.toThrow();

      expect(warn).not.toHaveBeenCalled();
      expect(observability.recordQueueJob).toHaveBeenCalledWith(
        expect.objectContaining({ outcome: 'failure' }),
      );
    });

    it('leaves other mail jobs to the queue defaults (no final warning)', async () => {
      await expect(
        processor.process(
          makeJob(
            JOB_GOOGLE_LINKED_ACCOUNT_SUSPENDED_EMAIL,
            { to: ADDRESS },
            { attemptsMade: 7, opts: { attempts: 8 } },
          ),
        ),
      ).rejects.toThrow();

      expect(warn).not.toHaveBeenCalled();
    });
  });

  it('sends the Google-linked password-removed notice without logging the address (TTW-179)', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await processor.process(
      makeJob(JOB_GOOGLE_LINKED_PASSWORD_REMOVED_EMAIL, {
        to: 'owner@example.com',
        settingsUrl: 'http://x/dashboard/settings',
      }),
    );

    expect(
      mailService.sendGoogleLinkedPasswordRemovedEmail,
    ).toHaveBeenCalledWith({
      to: 'owner@example.com',
      settingsUrl: 'http://x/dashboard/settings',
    });
    expect(observability.recordQueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobName: JOB_GOOGLE_LINKED_PASSWORD_REMOVED_EMAIL,
        outcome: 'success',
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('owner@example.com');
    log.mockRestore();
  });

  it('sends the Google-linked account-suspended notice without logging the address (TTW-179)', async () => {
    const log = jest
      .spyOn(Logger.prototype, 'log')
      .mockImplementation(() => undefined);

    await processor.process(
      makeJob(JOB_GOOGLE_LINKED_ACCOUNT_SUSPENDED_EMAIL, {
        to: 'owner@example.com',
      }),
    );

    expect(
      mailService.sendGoogleLinkedAccountSuspendedEmail,
    ).toHaveBeenCalledWith({ to: 'owner@example.com' });
    expect(observability.recordQueueJob).toHaveBeenCalledWith(
      expect.objectContaining({
        jobName: JOB_GOOGLE_LINKED_ACCOUNT_SUSPENDED_EMAIL,
        outcome: 'success',
      }),
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain('owner@example.com');
    log.mockRestore();
  });

  it('delivers notification outbox', async () => {
    await processor.process(
      makeJob(JOB_NOTIFICATION_OUTBOX, { outboxId: 'ob_1' }),
    );
    expect(delivery.deliverOutbox).toHaveBeenCalledWith('ob_1');
    expect(observability.recordQueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'success' }),
    );
  });

  it('throws on unknown job name', async () => {
    await expect(processor.process(makeJob('unknown-job', {}))).rejects.toThrow(
      'Unknown mail job name: unknown-job',
    );
    expect(observability.recordQueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'failure' }),
    );
  });
});
