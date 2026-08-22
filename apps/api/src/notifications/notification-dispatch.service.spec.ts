import { Test, TestingModule } from '@nestjs/testing';
import { NotificationDispatchService } from './notification-dispatch.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { ObservabilityService } from '../observability/observability.service';
import {
  NotificationCategory,
  NotificationChannel,
  NotificationStatus,
} from '../generated/prisma/enums';
import { OUTBOX_EVENT_PAYMENT_CONFIRMED } from '../mail/mail-outbox-templates';

describe('NotificationDispatchService', () => {
  let service: NotificationDispatchService;
  const prisma = {
    notificationPreference: { findUnique: jest.fn() },
    notificationConsent: { findFirst: jest.fn() },
    notificationOutbox: {
      findUnique: jest.fn(),
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  };
  const outboxDelivery = { enqueueDelivery: jest.fn() };
  const observability = {
    recordNotificationDispatch: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.notificationPreference.findUnique.mockResolvedValue(null);
    prisma.notificationConsent.findFirst.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDispatchService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: NotificationOutboxDeliveryService,
          useValue: outboxDelivery,
        },
        { provide: ObservabilityService, useValue: observability },
      ],
    }).compile();

    service = module.get(NotificationDispatchService);
  });

  it('queues required transactional notifications', async () => {
    prisma.notificationOutbox.create.mockResolvedValue({
      id: 'out-1',
      status: NotificationStatus.PENDING,
      category: NotificationCategory.TRANSACTIONAL,
      policyVersion: 'v1',
      suppressed: false,
    });

    const result = await service.dispatch({
      eventName: OUTBOX_EVENT_PAYMENT_CONFIRMED,
      channel: NotificationChannel.EMAIL,
      recipient: 'a@example.com',
      recipientUserId: 'u1',
      payload: { orderId: 'o1' },
    });

    expect(result.queued).toBe(true);
    expect(outboxDelivery.enqueueDelivery).toHaveBeenCalledWith('out-1');
  });

  it('does not enqueue when suppressed for missing marketing consent', async () => {
    prisma.notificationOutbox.create.mockResolvedValue({
      id: 'out-2',
      suppressed: true,
    });

    const result = await service.dispatch({
      eventName: 'AdminBroadcast',
      channel: NotificationChannel.EMAIL,
      recipient: 'a@example.com',
      recipientUserId: 'u1',
      payload: { subject: 'Hi', bodyHtml: '<p>Hi</p>' },
    });

    expect(result.suppressed).toBe(true);
    expect(outboxDelivery.enqueueDelivery).not.toHaveBeenCalled();
  });
});
