import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { getQueueToken } from '@nestjs/bullmq';
import { NotificationOutboxDeliveryService } from './notification-outbox-delivery.service';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';
import { SmsService } from './sms.service';
import { ObservabilityService } from '../observability/observability.service';
import { MAIL_QUEUE_NAME } from '../constants';
import {
  NotificationChannel,
  NotificationStatus,
} from '../generated/prisma/enums';
import { OUTBOX_EVENT_ORDER_PLACED } from './mail-outbox-templates';

describe('NotificationOutboxDeliveryService', () => {
  let service: NotificationOutboxDeliveryService;
  let prisma: {
    notificationOutbox: {
      findUnique: jest.Mock;
      findUniqueOrThrow: jest.Mock;
      updateMany: jest.Mock;
      update: jest.Mock;
    };
    notificationDeliveryAttempt: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let mailService: { sendTemplatedEmail: jest.Mock };
  let smsService: { send: jest.Mock };
  let mailQueue: { add: jest.Mock };
  let observability: { recordNotificationDeliveryAttempt: jest.Mock };
  const fetchMock = jest.fn();

  beforeEach(async () => {
    prisma = {
      notificationOutbox: {
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        updateMany: jest.fn(),
        update: jest.fn(),
      },
      notificationDeliveryAttempt: { create: jest.fn() },
      $transaction: jest.fn(async (ops: unknown[]) => {
        for (const op of ops) await op;
      }),
    };
    mailService = {
      sendTemplatedEmail: jest.fn().mockResolvedValue(undefined),
    };
    smsService = { send: jest.fn().mockResolvedValue(undefined) };
    mailQueue = { add: jest.fn().mockResolvedValue(undefined) };
    observability = { recordNotificationDeliveryAttempt: jest.fn() };
    fetchMock.mockReset();
    global.fetch = fetchMock as unknown as typeof fetch;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationOutboxDeliveryService,
        { provide: PrismaService, useValue: prisma },
        { provide: MailService, useValue: mailService },
        { provide: SmsService, useValue: smsService },
        { provide: ObservabilityService, useValue: observability },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, def?: number) => def ?? 8),
          },
        },
        { provide: getQueueToken(MAIL_QUEUE_NAME), useValue: mailQueue },
      ],
    }).compile();

    service = module.get(NotificationOutboxDeliveryService);
  });

  function pendingRow(
    overrides: Partial<{
      channel: NotificationChannel;
      eventName: string;
      recipient: string;
      payload: unknown;
      attempts: number;
      suppressed: boolean;
    }> = {},
  ) {
    return {
      id: 'out-1',
      status: NotificationStatus.PENDING,
      attempts: 0,
      suppressed: false,
      category: null,
      channel: NotificationChannel.EMAIL,
      eventName: OUTBOX_EVENT_ORDER_PLACED,
      recipient: 'a@x.com',
      payload: { orderId: 'o1', totalAmount: 10, currency: 'NGN' },
      ...overrides,
    };
  }

  function claimAndLoad(row: ReturnType<typeof pendingRow>) {
    prisma.notificationOutbox.findUnique.mockResolvedValue(row);
    prisma.notificationOutbox.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValue({ count: 1 });
    prisma.notificationOutbox.findUniqueOrThrow.mockResolvedValue({
      ...row,
      status: NotificationStatus.PROCESSING,
    });
  }

  it('dispatches EMAIL via templated mail and records attempt', async () => {
    claimAndLoad(pendingRow());
    await service.deliverOutbox('out-1');
    expect(mailService.sendTemplatedEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@x.com',
        template: 'order-placed',
      }),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(
      observability.recordNotificationDeliveryAttempt,
    ).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'success' }));
  });

  it('skips suppressed rows', async () => {
    prisma.notificationOutbox.findUnique.mockResolvedValue(
      pendingRow({ suppressed: true }),
    );
    await service.deliverOutbox('out-1');
    expect(mailService.sendTemplatedEmail).not.toHaveBeenCalled();
  });

  it('dispatches SMS with truncated scalar text', async () => {
    claimAndLoad(
      pendingRow({
        channel: NotificationChannel.SMS,
        recipient: '+15551212',
        payload: { text: 'hello' },
      }),
    );
    await service.deliverOutbox('out-1');
    expect(smsService.send).toHaveBeenCalledWith('+15551212', 'hello');
  });

  it('dispatches SLACK to an allowed webhook host', async () => {
    fetchMock.mockResolvedValue({ ok: true, text: () => Promise.resolve('') });
    claimAndLoad(
      pendingRow({
        channel: NotificationChannel.SLACK,
        recipient: 'https://hooks.slack.com/services/T/B/X',
        payload: { text: 'ping' },
      }),
    );
    await service.deliverOutbox('out-1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://hooks.slack.com/services/T/B/X',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('rejects unsupported channels', async () => {
    claimAndLoad(
      pendingRow({
        channel: 'PUSH' as NotificationChannel,
      }),
    );
    prisma.notificationOutbox.update.mockResolvedValue({});
    await expect(service.deliverOutbox('out-1')).rejects.toThrow(
      /Unsupported notification channel/,
    );
  });
});
