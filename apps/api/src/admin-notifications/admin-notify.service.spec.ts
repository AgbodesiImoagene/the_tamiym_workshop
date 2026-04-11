import { Test, TestingModule } from '@nestjs/testing';
import { AdminNotifyService } from './admin-notify.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { ADMIN_NOTIF_ORDER_PLACED } from './admin-notification-events';
import { OUTBOX_EVENT_ADMIN_OPERATIONAL } from '../mail/mail-outbox-templates';

describe('AdminNotifyService', () => {
  let service: AdminNotifyService;
  let prisma: { adminNotificationRoute: { findMany: jest.Mock } };
  let notificationOutbox: { create: jest.Mock };
  let enqueueDelivery: jest.Mock;

  beforeEach(async () => {
    notificationOutbox = {
      create: jest.fn().mockResolvedValue({ id: 'ob-1' }),
    };
    enqueueDelivery = jest.fn().mockResolvedValue(undefined);
    prisma = {
      adminNotificationRoute: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'route-1',
            eventKey: ADMIN_NOTIF_ORDER_PLACED,
            enabled: true,
            notifyEmail: true,
            emailRecipients: ['ops@test.com'],
            notifySms: false,
            smsRecipients: [],
            notifySlack: false,
            slackWebhookUrl: null,
            subjectTemplate: null,
            emailBodyTemplate: null,
            smsBodyTemplate: null,
          },
        ]),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminNotifyService,
        {
          provide: PrismaService,
          useValue: {
            ...prisma,
            notificationOutbox,
          },
        },
        {
          provide: NotificationOutboxDeliveryService,
          useValue: { enqueueDelivery },
        },
      ],
    }).compile();

    service = module.get(AdminNotifyService);
  });

  it('creates email outbox rows and enqueues delivery', async () => {
    await service.emit(ADMIN_NOTIF_ORDER_PLACED, {
      orderId: 'ord-1',
      userId: 'u1',
      totalAmount: 100,
      currency: 'NGN',
      campaignId: '',
    });

    expect(notificationOutbox.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        eventName: OUTBOX_EVENT_ADMIN_OPERATIONAL,
        channel: 'EMAIL',
        recipient: 'ops@test.com',
        payload: expect.objectContaining({
          subject: expect.any(String),
          html: expect.any(String),
          eventKey: ADMIN_NOTIF_ORDER_PLACED,
        }),
        status: 'PENDING',
      }),
    });
    expect(enqueueDelivery).toHaveBeenCalledWith('ob-1');
  });

  it('no-ops when no enabled routes', async () => {
    prisma.adminNotificationRoute.findMany.mockResolvedValue([]);
    await service.emit(ADMIN_NOTIF_ORDER_PLACED, { orderId: 'x' });
    expect(notificationOutbox.create).not.toHaveBeenCalled();
  });
});
