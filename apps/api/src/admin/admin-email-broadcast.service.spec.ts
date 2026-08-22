import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminEmailBroadcastService } from './admin-email-broadcast.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import {
  AdminBroadcastEmailDto,
  AdminEmailAudience,
} from './dto/admin-broadcast-email.dto';

describe('AdminEmailBroadcastService', () => {
  let service: AdminEmailBroadcastService;
  let prisma: {
    user: { findMany: jest.Mock };
  };
  let dispatch: { dispatch: jest.Mock };
  let audit: { log: jest.Mock };

  beforeEach(async () => {
    prisma = {
      user: { findMany: jest.fn() },
    };
    dispatch = {
      dispatch: jest.fn().mockResolvedValue({
        outboxId: 'out-1',
        queued: true,
        suppressed: false,
      }),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminEmailBroadcastService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((_k: string, def?: number) => def) },
        },
        { provide: AuditService, useValue: audit },
        {
          provide: NotificationOutboxDeliveryService,
          useValue: { enqueueDelivery: jest.fn() },
        },
        { provide: NotificationDispatchService, useValue: dispatch },
      ],
    }).compile();

    service = module.get(AdminEmailBroadcastService);
  });

  it('dryRun returns count and samples', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'a@x.com', firstName: 'A' },
      { id: 'u2', email: 'b@x.com', firstName: 'B' },
    ]);
    const dto: AdminBroadcastEmailDto = {
      audience: AdminEmailAudience.VERIFIED_CUSTOMERS,
      subject: 'S',
      htmlBody: '<p>x</p>',
      dryRun: true,
    };
    const r = await service.execute(dto, 'admin-1');
    expect(r).toEqual({
      dryRun: true,
      recipientCount: 2,
      sampleEmails: ['a@x.com', 'b@x.com'],
    });
    expect(dispatch.dispatch).not.toHaveBeenCalled();
  });

  it('throws when USER_IDS without ids', async () => {
    const dto: AdminBroadcastEmailDto = {
      audience: AdminEmailAudience.USER_IDS,
      subject: 'S',
      htmlBody: '<p>x</p>',
    };
    await expect(service.execute(dto, 'admin-1')).rejects.toThrow(
      BadRequestException,
    );
  });

  it('dispatches through notification policy service', async () => {
    prisma.user.findMany.mockResolvedValue([
      { id: 'u1', email: 'a@x.com', firstName: 'A' },
    ]);
    const dto: AdminBroadcastEmailDto = {
      audience: AdminEmailAudience.VERIFIED_ORGANIZERS,
      subject: 'Hello',
      htmlBody: '<p>Body</p>',
    };
    const r = await service.execute(dto, 'admin-1');
    expect(r).toEqual({
      dryRun: false,
      recipientCount: 1,
      queued: 1,
    });
    expect(dispatch.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        eventName: 'AdminBroadcast',
        recipient: 'a@x.com',
        recipientUserId: 'u1',
      }),
    );
    expect(audit.log).toHaveBeenCalled();
  });
});
