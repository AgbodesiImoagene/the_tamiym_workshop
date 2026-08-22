import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationDeadLetterService } from './notification-dead-letter.service';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationDispatchService } from './notification-dispatch.service';
import { ObservabilityService } from '../observability/observability.service';
import {
  NotificationChannel,
  NotificationStatus,
} from '../generated/prisma/enums';

describe('NotificationDeadLetterService', () => {
  let service: NotificationDeadLetterService;
  const prisma = {
    notificationOutbox: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
      update: jest.fn(),
      aggregate: jest.fn(),
    },
  };
  const dispatch = { dispatch: jest.fn() };
  const observability = { recordNotificationDeadLetterReplay: jest.fn() };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDeadLetterService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationDispatchService, useValue: dispatch },
        { provide: ObservabilityService, useValue: observability },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_k, def) => def) },
        },
      ],
    }).compile();
    service = module.get(NotificationDeadLetterService);
  });

  it('lists failed rows with masked recipients', async () => {
    prisma.notificationOutbox.findMany.mockResolvedValue([
      {
        id: 'dl-1',
        eventName: 'PaymentConfirmed',
        channel: NotificationChannel.EMAIL,
        recipient: 'alice@example.com',
        category: null,
        policyVersion: 'v1',
        effectKey: 'k1',
        generation: 1,
        attempts: 8,
        lastError: 'timeout',
        deadLetterAckStatus: 'OPEN',
        deadLetterAckAt: null,
        updatedAt: new Date(),
        createdAt: new Date(),
      },
    ]);

    const result = await service.listDeadLetters({});
    expect(result.items[0].recipient).toBe('a***@example.com');
  });

  it('replays with next generation when acknowledged', async () => {
    prisma.notificationOutbox.findFirst
      .mockResolvedValueOnce({
        id: 'dl-1',
        status: NotificationStatus.FAILED,
        deadLetterAckStatus: 'ACKNOWLEDGED',
        effectKey: 'PaymentConfirmed:u1:EMAIL',
        channel: NotificationChannel.EMAIL,
        eventName: 'PaymentConfirmed',
        recipient: 'a@example.com',
        recipientUserId: 'u1',
        payload: {},
        generation: 1,
      })
      .mockResolvedValueOnce(null);
    prisma.notificationOutbox.aggregate.mockResolvedValue({
      _max: { generation: 1 },
    });
    dispatch.dispatch.mockResolvedValue({
      outboxId: 'out-2',
      queued: true,
    });

    const result = await service.replayDeadLetter(
      'dl-1',
      'admin-1',
      'provider outage recovered',
    );
    expect(result.generation).toBe(2);
    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ forceQueue: true, generation: 2 }),
    );
  });

  it('requires acknowledgement before replay', async () => {
    prisma.notificationOutbox.findFirst.mockResolvedValue({
      id: 'dl-1',
      status: NotificationStatus.FAILED,
      deadLetterAckStatus: 'OPEN',
      effectKey: 'k1',
      channel: NotificationChannel.EMAIL,
      generation: 1,
    });
    await expect(
      service.replayDeadLetter('dl-1', 'admin-1', 'reason'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dispatch.dispatch).not.toHaveBeenCalled();
  });

  it('throws when dead letter missing', async () => {
    prisma.notificationOutbox.findFirst.mockResolvedValue(null);
    await expect(
      service.replayDeadLetter('missing', 'admin-1', 'reason'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
