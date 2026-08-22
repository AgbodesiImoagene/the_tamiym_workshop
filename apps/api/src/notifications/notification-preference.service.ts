import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  NotificationCategory,
  NotificationConsentSource,
  NotificationPreferenceChannel,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import {
  categoryRequiresMarketingConsent,
  isPreferenceCategoryMutable,
  NOTIFICATION_POLICY_VERSION,
  OPTIONAL_PREFERENCE_CATEGORIES,
} from './notification-policy';
import {
  NOTIFICATION_UNSUBSCRIBE_TTL_MS,
  signNotificationUnsubscribeToken,
  verifyNotificationUnsubscribeToken,
} from './notification-unsubscribe.helpers';

export type NotificationPreferenceView = {
  policyVersion: string;
  preferences: Array<{
    channel: NotificationPreferenceChannel;
    category: NotificationCategory;
    enabled: boolean;
    required: boolean;
    requiresMarketingConsent: boolean;
  }>;
};

@Injectable()
export class NotificationPreferenceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async getPreferences(userId: string): Promise<NotificationPreferenceView> {
    const rows = await this.prisma.notificationPreference.findMany({
      where: { userId },
    });
    const byKey = new Map(
      rows.map((row) => [`${row.channel}:${row.category}`, row]),
    );

    const preferences = [];
    for (const category of OPTIONAL_PREFERENCE_CATEGORIES) {
      for (const channel of Object.values(NotificationPreferenceChannel)) {
        const existing = byKey.get(`${channel}:${category}`);
        preferences.push({
          channel,
          category,
          enabled:
            existing?.enabled ?? !categoryRequiresMarketingConsent(category),
          required: false,
          requiresMarketingConsent: categoryRequiresMarketingConsent(category),
        });
      }
    }

    return {
      policyVersion: NOTIFICATION_POLICY_VERSION,
      preferences,
    };
  }

  async updatePreferences(
    userId: string,
    updates: Array<{
      channel: NotificationPreferenceChannel;
      category: NotificationCategory;
      enabled: boolean;
    }>,
    source: NotificationConsentSource = NotificationConsentSource.PREFERENCE_SETTINGS,
  ): Promise<NotificationPreferenceView> {
    for (const update of updates) {
      if (!isPreferenceCategoryMutable(update.category)) {
        throw new BadRequestException(
          `Category ${update.category} cannot be changed via preferences.`,
        );
      }
      if (categoryRequiresMarketingConsent(update.category) && update.enabled) {
        const latestConsent = await this.prisma.notificationConsent.findFirst({
          where: {
            userId,
            channel: update.channel,
            category: update.category,
          },
          orderBy: { createdAt: 'desc' },
        });
        if (!latestConsent?.granted) {
          throw new BadRequestException(
            'Marketing notifications require explicit consent before enabling.',
          );
        }
      }
    }

    await this.prisma.$transaction(async (tx) => {
      for (const update of updates) {
        await tx.notificationPreference.upsert({
          where: {
            userId_channel_category: {
              userId,
              channel: update.channel,
              category: update.category,
            },
          },
          create: {
            userId,
            channel: update.channel,
            category: update.category,
            enabled: update.enabled,
            policyVersion: NOTIFICATION_POLICY_VERSION,
          },
          update: {
            enabled: update.enabled,
            policyVersion: NOTIFICATION_POLICY_VERSION,
          },
        });
        await tx.notificationConsent.create({
          data: {
            userId,
            channel: update.channel,
            category: update.category,
            granted: update.enabled,
            source,
            policyVersion: NOTIFICATION_POLICY_VERSION,
          },
        });
      }
    });

    return this.getPreferences(userId);
  }

  async grantMarketingConsent(
    userId: string,
    channel: NotificationPreferenceChannel,
  ): Promise<NotificationPreferenceView> {
    await this.prisma.notificationConsent.create({
      data: {
        userId,
        channel,
        category: NotificationCategory.MARKETING,
        granted: true,
        source: NotificationConsentSource.PREFERENCE_SETTINGS,
        policyVersion: NOTIFICATION_POLICY_VERSION,
      },
    });
    return this.getPreferences(userId);
  }

  createUnsubscribeToken(
    userId: string,
    category: NotificationCategory,
    channel: NotificationPreferenceChannel,
  ): string {
    if (!isPreferenceCategoryMutable(category)) {
      throw new BadRequestException(
        'This notification category cannot be unsubscribed.',
      );
    }
    return signNotificationUnsubscribeToken(
      {
        userId,
        category,
        channel,
        exp: Date.now() + NOTIFICATION_UNSUBSCRIBE_TTL_MS,
      },
      this.unsubscribeSecret(),
    );
  }

  async applyUnsubscribeToken(token: string): Promise<{ applied: boolean }> {
    const payload = verifyNotificationUnsubscribeToken(
      token,
      this.unsubscribeSecret(),
    );
    if (!payload) {
      throw new BadRequestException('Invalid or expired unsubscribe token.');
    }
    const user = await this.prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true },
    });
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    await this.updatePreferences(
      payload.userId,
      [
        {
          channel: payload.channel,
          category: payload.category,
          enabled: false,
        },
      ],
      NotificationConsentSource.UNSUBSCRIBE_LINK,
    );
    return { applied: true };
  }

  private unsubscribeSecret(): string {
    return (
      this.config.get<string>('NOTIFICATION_UNSUBSCRIBE_SECRET') ??
      this.config.get<string>('JWT_ACCESS_SECRET') ??
      'dev-unsubscribe-secret'
    );
  }
}
