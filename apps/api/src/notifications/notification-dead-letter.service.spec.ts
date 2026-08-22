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

  it('denies replay when next generation already succeeded', async () => {
    prisma.notificationOutbox.findFirst
      .mockResolvedValueOnce({
        id: 'dl-1',
        status: NotificationStatus.FAILED,
        deadLetterAckStatus: 'ACKNOWLEDGED',
        effectKey: 'PaymentConfirmed:u1:EMAIL',
        channel: NotificationChannel.EMAIL,
        generation: 1,
      })
      .mockResolvedValueOnce({
        id: 'out-sent',
        status: NotificationStatus.SENT,
      });
    prisma.notificationOutbox.aggregate.mockResolvedValue({
      _max: { generation: 1 },
    });

    await expect(
      service.replayDeadLetter('dl-1', 'admin-1', 'retry'),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(dispatch.dispatch).not.toHaveBeenCalled();
    expect(
      observability.recordNotificationDeadLetterReplay,
    ).toHaveBeenCalledWith({ outcome: 'denied' });
  });

  it('throws when dead letter missing', async () => {
    prisma.notificationOutbox.findFirst.mockResolvedValue(null);
    await expect(
      service.replayDeadLetter('missing', 'admin-1', 'reason'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns redacted dead letter detail with attempts', async () => {
    prisma.notificationOutbox.findFirst.mockResolvedValue({
      id: 'dl-1',
      channel: NotificationChannel.EMAIL,
      recipient: 'alice@example.com',
      payload: { secret: 'value' },
      lastError: 'smtp timeout',
      deliveryAttempts: [{ attemptNumber: 1, errorMessage: 'smtp timeout' }],
      replayedFrom: null,
      replays: [],
    });

    const result = await service.getDeadLetter('dl-1');

    expect(result.recipient).toBe('a***@example.com');
    expect(result.lastError).toBe('smtp timeout');
    expect(result.deliveryAttempts[0].errorMessage).toBe('smtp timeout');
  });

  it('throws when dead letter detail missing', async () => {
    prisma.notificationOutbox.findFirst.mockResolvedValue(null);
    await expect(service.getDeadLetter('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('acknowledges dead letter and returns detail', async () => {
    prisma.notificationOutbox.updateMany.mockResolvedValue({ count: 1 });
    prisma.notificationOutbox.findFirst.mockResolvedValue({
      id: 'dl-1',
      channel: NotificationChannel.EMAIL,
      recipient: 'a@example.com',
      payload: {},
      lastError: null,
      deliveryAttempts: [],
      replayedFrom: null,
      replays: [],
    });

    const result = await service.acknowledgeDeadLetter(
      'dl-1',
      'admin-1',
      'reviewed',
    );

    expect(prisma.notificationOutbox.updateMany).toHaveBeenCalled();
    expect(result.id).toBe('dl-1');
  });

  it('throws when acknowledge target missing', async () => {
    prisma.notificationOutbox.updateMany.mockResolvedValue({ count: 0 });
    await expect(
      service.acknowledgeDeadLetter('missing', 'admin-1'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rejects replay without reason', async () => {
    await expect(
      service.replayDeadLetter('dl-1', 'admin-1', '   '),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects replay when effect key missing', async () => {
    prisma.notificationOutbox.findFirst.mockResolvedValue({
      id: 'dl-1',
      status: NotificationStatus.FAILED,
      deadLetterAckStatus: 'ACKNOWLEDGED',
      effectKey: null,
      channel: NotificationChannel.EMAIL,
      generation: 1,
    });
    await expect(
      service.replayDeadLetter('dl-1', 'admin-1', 'reason'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('bulk replays and captures per-item errors', async () => {
    prisma.notificationOutbox.findFirst
      .mockResolvedValueOnce({
        id: 'dl-1',
        status: NotificationStatus.FAILED,
        deadLetterAckStatus: 'OPEN',
        effectKey: 'k1',
        channel: NotificationChannel.EMAIL,
        generation: 1,
      })
      .mockResolvedValueOnce(null);
    const result = await service.replayDeadLettersBulk(
      ['dl-1'],
      'admin-1',
      'retry',
    );
    expect(result.results[0]).toEqual(
      expect.objectContaining({
        id: 'dl-1',
        error: expect.any(String),
      }),
    );
  });

  it('rejects empty bulk replay', async () => {
    await expect(
      service.replayDeadLettersBulk([], 'admin-1', 'retry'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects bulk replay above configured max', async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationDeadLetterService,
        { provide: PrismaService, useValue: prisma },
        { provide: NotificationDispatchService, useValue: dispatch },
        { provide: ObservabilityService, useValue: observability },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => 1) },
        },
      ],
    }).compile();
    const limited = module.get(NotificationDeadLetterService);

    await expect(
      limited.replayDeadLettersBulk(['a', 'b'], 'admin-1', 'retry'),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
