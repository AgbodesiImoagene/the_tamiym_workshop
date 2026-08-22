import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationOutboxBackfillService } from './notification-outbox-backfill.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationOutboxDeliveryService } from './notification-outbox-delivery.service';
import { ObservabilityService } from '../observability/observability.service';
import { NotificationStatus } from '../generated/prisma/enums';

describe('NotificationOutboxBackfillService', () => {
  let service: NotificationOutboxBackfillService;
  const prisma = {
    notificationOutbox: {
      updateMany: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
    },
  };
  const delivery = { enqueueDelivery: jest.fn() };
  const observability = {
    recordNotificationQueueOldestPendingAge: jest.fn(),
    startSpan: jest.fn((_n, _a, cb) => cb()),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.notificationOutbox.updateMany.mockResolvedValue({ count: 0 });
    prisma.notificationOutbox.findMany.mockResolvedValue([]);
    prisma.notificationOutbox.findFirst.mockResolvedValue({
      createdAt: new Date(Date.now() - 45 * 60 * 1000),
    });

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationOutboxBackfillService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationOutboxDeliveryService, useValue: delivery },
        { provide: ObservabilityService, useValue: observability },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((_key: string, def?: number) => def ?? 15),
          },
        },
      ],
    }).compile();

    service = module.get(NotificationOutboxBackfillService);
  });

  it('records queue SLO metrics during maintenance', async () => {
    await service.runOutboxMaintenance();
    expect(
      observability.recordNotificationQueueOldestPendingAge,
    ).toHaveBeenCalled();
  });

  it('requeues pending rows', async () => {
    prisma.notificationOutbox.findMany.mockResolvedValue([{ id: 'out-1' }]);
    await service.runOutboxMaintenance();
    expect(delivery.enqueueDelivery).toHaveBeenCalledWith('out-1');
  });

  it('resets stale processing rows', async () => {
    prisma.notificationOutbox.updateMany.mockResolvedValueOnce({ count: 2 });
    await service.runOutboxMaintenance();
    expect(prisma.notificationOutbox.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: NotificationStatus.PROCESSING,
        }),
      }),
    );
  });
});
