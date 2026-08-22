import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { NotificationPreferenceService } from './notification-preference.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  NotificationCategory,
  NotificationPreferenceChannel,
} from '../generated/prisma/enums';

describe('NotificationPreferenceService', () => {
  let service: NotificationPreferenceService;
  const prisma: {
    notificationPreference: {
      findMany: jest.Mock;
      upsert: jest.Mock;
    };
    notificationConsent: {
      findFirst: jest.Mock;
      create: jest.Mock;
    };
    user: { findUnique: jest.Mock };
    $transaction: jest.Mock;
  } = {
    notificationPreference: {
      findMany: jest.fn(),
      upsert: jest.fn(),
    },
    notificationConsent: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
    user: { findUnique: jest.fn() },
    $transaction: jest.fn(async (cb: (tx: typeof prisma) => Promise<unknown>) =>
      cb(prisma),
    ),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    prisma.notificationPreference.findMany.mockResolvedValue([]);
    prisma.notificationConsent.findFirst.mockResolvedValue(null);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NotificationPreferenceService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn(() => 'secret') },
        },
      ],
    }).compile();

    service = module.get(NotificationPreferenceService);
  });

  it('returns default optional preferences', async () => {
    const view = await service.getPreferences('u1');
    expect(view.preferences.length).toBeGreaterThan(0);
    expect(view.policyVersion).toContain('notification-delivery');
  });

  it('blocks marketing enable without consent', async () => {
    await expect(
      service.updatePreferences('u1', [
        {
          channel: NotificationPreferenceChannel.EMAIL,
          category: NotificationCategory.MARKETING,
          enabled: true,
        },
      ]),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
