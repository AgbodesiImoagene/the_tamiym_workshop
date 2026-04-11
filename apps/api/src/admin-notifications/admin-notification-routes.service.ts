import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateAdminNotificationRouteDto } from './dto/create-admin-notification-route.dto';
import { UpdateAdminNotificationRouteDto } from './dto/update-admin-notification-route.dto';
import { ADMIN_NOTIFICATION_EVENT_CATALOG } from './admin-notification-events';

@Injectable()
export class AdminNotificationRoutesService {
  constructor(private readonly prisma: PrismaService) {}

  listEventCatalog() {
    return ADMIN_NOTIFICATION_EVENT_CATALOG;
  }

  findAll() {
    return this.prisma.adminNotificationRoute.findMany({
      orderBy: [{ eventKey: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string) {
    const row = await this.prisma.adminNotificationRoute.findUnique({
      where: { id },
    });
    if (!row) {
      throw new NotFoundException('Notification route not found');
    }
    return row;
  }

  private assertSlackUrl(url: string | null | undefined): void {
    if (!url) return;
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('slackWebhookUrl is not a valid URL');
    }
    if (
      parsed.protocol !== 'https:' ||
      !parsed.hostname.endsWith('.slack.com')
    ) {
      throw new BadRequestException(
        'slackWebhookUrl must be an https://hooks.slack.com/... URL',
      );
    }
  }

  create(dto: CreateAdminNotificationRouteDto) {
    this.assertSlackUrl(dto.slackWebhookUrl);
    return this.prisma.adminNotificationRoute.create({
      data: {
        eventKey: dto.eventKey,
        name: dto.name ?? 'default',
        enabled: dto.enabled ?? true,
        notifyEmail: dto.notifyEmail ?? false,
        emailRecipients: dto.emailRecipients ?? [],
        notifySms: dto.notifySms ?? false,
        smsRecipients: dto.smsRecipients ?? [],
        notifySlack: dto.notifySlack ?? false,
        slackWebhookUrl: dto.slackWebhookUrl ?? null,
        subjectTemplate: dto.subjectTemplate ?? null,
        emailBodyTemplate: dto.emailBodyTemplate ?? null,
        smsBodyTemplate: dto.smsBodyTemplate ?? null,
      },
    });
  }

  async update(id: string, dto: UpdateAdminNotificationRouteDto) {
    await this.findOne(id);
    if (dto.slackWebhookUrl !== undefined) {
      this.assertSlackUrl(dto.slackWebhookUrl);
    }
    return this.prisma.adminNotificationRoute.update({
      where: { id },
      data: {
        ...(dto.enabled !== undefined && { enabled: dto.enabled }),
        ...(dto.notifyEmail !== undefined && { notifyEmail: dto.notifyEmail }),
        ...(dto.emailRecipients !== undefined && {
          emailRecipients: dto.emailRecipients,
        }),
        ...(dto.notifySms !== undefined && { notifySms: dto.notifySms }),
        ...(dto.smsRecipients !== undefined && {
          smsRecipients: dto.smsRecipients,
        }),
        ...(dto.notifySlack !== undefined && { notifySlack: dto.notifySlack }),
        ...(dto.slackWebhookUrl !== undefined && {
          slackWebhookUrl: dto.slackWebhookUrl,
        }),
        ...(dto.subjectTemplate !== undefined && {
          subjectTemplate: dto.subjectTemplate,
        }),
        ...(dto.emailBodyTemplate !== undefined && {
          emailBodyTemplate: dto.emailBodyTemplate,
        }),
        ...(dto.smsBodyTemplate !== undefined && {
          smsBodyTemplate: dto.smsBodyTemplate,
        }),
      },
    });
  }

  async remove(id: string) {
    await this.findOne(id);
    return this.prisma.adminNotificationRoute.delete({ where: { id } });
  }
}
