import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { MailProcessor } from './mail.processor';
import { MailService } from '../mail.service';
import { ObservabilityService } from '../../observability/observability.service';
import { NotificationOutboxDeliveryService } from '../notification-outbox-delivery.service';
import {
  JOB_NOTIFICATION_OUTBOX,
  JOB_PASSWORD_RESET_EMAIL,
  JOB_VERIFICATION_EMAIL,
} from '../../constants';

describe('MailProcessor', () => {
  let processor: MailProcessor;
  let mailService: jest.Mocked<
    Pick<MailService, 'sendVerificationEmail' | 'sendPasswordResetEmail'>
  >;
  let delivery: jest.Mocked<
    Pick<NotificationOutboxDeliveryService, 'deliverOutbox'>
  >;
  let observability: jest.Mocked<Pick<ObservabilityService, 'recordQueueJob'>>;

  beforeEach(async () => {
    mailService = {
      sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
      sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
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

  function makeJob(name: string, data: object): Job {
    return { name, data, id: 'job-1' } as unknown as Job;
  }

  it('sends verification email', async () => {
    await processor.process(
      makeJob(JOB_VERIFICATION_EMAIL, {
        to: 'a@b.com',
        token: 't',
        verifyUrl: 'http://x/verify',
      }),
    );
    expect(mailService.sendVerificationEmail).toHaveBeenCalledWith({
      to: 'a@b.com',
      token: 't',
      verifyUrl: 'http://x/verify',
    });
    expect(observability.recordQueueJob).toHaveBeenCalledWith(
      expect.objectContaining({ outcome: 'success' }),
    );
  });

  it('sends password reset email', async () => {
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
