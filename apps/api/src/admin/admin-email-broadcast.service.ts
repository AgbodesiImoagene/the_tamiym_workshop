import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import sanitizeHtml from 'sanitize-html';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { NotificationDispatchService } from '../notifications/notification-dispatch.service';
import {
  AuditAction,
  NotificationChannel,
  UserRole,
  UserStatus,
} from '../generated/prisma/enums';
import {
  AdminBroadcastEmailDto,
  AdminEmailAudience,
} from './dto/admin-broadcast-email.dto';
import { OUTBOX_EVENT_ADMIN_BROADCAST } from '../mail/mail-outbox-templates';

const SANITIZE_OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    ...sanitizeHtml.defaults.allowedTags,
    'h1',
    'h2',
    'h3',
    'img',
    'table',
    'thead',
    'tbody',
    'tr',
    'td',
    'th',
    'hr',
  ],
  allowedAttributes: {
    ...sanitizeHtml.defaults.allowedAttributes,
    a: ['href', 'name', 'target', 'rel'],
    img: ['src', 'alt', 'width', 'height'],
    td: ['colspan', 'rowspan'],
    th: ['colspan', 'rowspan'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowVulnerableTags: false,
};

export interface AdminBroadcastPreviewResult {
  dryRun: true;
  recipientCount: number;
  sampleEmails: string[];
}

export interface AdminBroadcastSendResult {
  dryRun: false;
  recipientCount: number;
  queued: number;
}

@Injectable()
export class AdminEmailBroadcastService {
  private readonly logger = new Logger(AdminEmailBroadcastService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
    private readonly notificationOutboxDelivery: NotificationOutboxDeliveryService,
    private readonly notificationDispatch: NotificationDispatchService,
  ) {}

  async execute(
    dto: AdminBroadcastEmailDto,
    actorUserId: string,
  ): Promise<AdminBroadcastPreviewResult | AdminBroadcastSendResult> {
    const recipients = await this.resolveRecipients(dto);
    const maxRecipients = this.config.get<number>(
      'ADMIN_EMAIL_BROADCAST_MAX_RECIPIENTS',
      1000,
    );
    if (recipients.length > maxRecipients) {
      throw new BadRequestException(
        `Audience size ${recipients.length} exceeds limit ${maxRecipients}. Narrow the segment or raise ADMIN_EMAIL_BROADCAST_MAX_RECIPIENTS.`,
      );
    }

    if (dto.dryRun) {
      return {
        dryRun: true,
        recipientCount: recipients.length,
        sampleEmails: recipients.slice(0, 5).map((u) => u.email),
      };
    }

    const bodyHtml = sanitizeHtml(dto.htmlBody, SANITIZE_OPTIONS);
    if (!bodyHtml.trim()) {
      throw new BadRequestException(
        'htmlBody is empty after sanitization; check allowed tags and content.',
      );
    }

    let queued = 0;
    for (const user of recipients) {
      const result = await this.notificationDispatch.dispatch({
        eventName: OUTBOX_EVENT_ADMIN_BROADCAST,
        channel: NotificationChannel.EMAIL,
        recipient: user.email,
        recipientUserId: user.id,
        payload: {
          subject: dto.subject,
          bodyHtml,
          firstName: user.firstName,
        },
      });
      if (result.queued) queued += 1;
    }

    await this.audit.log({
      eventName: 'admin.notifications.email.broadcast',
      action: AuditAction.CREATE,
      entityType: 'NotificationBroadcast',
      entityId: `broadcast:${actorUserId}:${Date.now()}`,
      actorUserId,
      after: {
        audience: dto.audience,
        recipientCount: recipients.length,
        subject: dto.subject,
      },
      note: `Admin queued ${queued} custom email(s)`,
    });

    this.logger.log(
      `Admin ${actorUserId} queued ${queued} broadcast email(s), audience=${dto.audience}`,
    );

    return {
      dryRun: false,
      recipientCount: recipients.length,
      queued,
    };
  }

  private async resolveRecipients(
    dto: AdminBroadcastEmailDto,
  ): Promise<{ id: string; email: string; firstName: string }[]> {
    const select = { id: true, email: true, firstName: true };

    switch (dto.audience) {
      case AdminEmailAudience.USER_IDS: {
        if (!dto.userIds?.length) {
          throw new BadRequestException(
            'userIds is required when audience is USER_IDS',
          );
        }
        return this.prisma.user.findMany({
          where: {
            id: { in: dto.userIds },
            status: UserStatus.ACTIVE,
            emailVerifiedAt: { not: null },
          },
          select,
        });
      }
      case AdminEmailAudience.VERIFIED_CUSTOMERS:
        return this.prisma.user.findMany({
          where: {
            status: UserStatus.ACTIVE,
            emailVerifiedAt: { not: null },
            role: UserRole.CUSTOMER,
          },
          select,
        });
      case AdminEmailAudience.VERIFIED_ORGANIZERS:
        return this.prisma.user.findMany({
          where: {
            status: UserStatus.ACTIVE,
            emailVerifiedAt: { not: null },
            role: UserRole.ORGANIZER,
          },
          select,
        });
      case AdminEmailAudience.VERIFIED_CUSTOMERS_AND_ORGANIZERS:
        return this.prisma.user.findMany({
          where: {
            status: UserStatus.ACTIVE,
            emailVerifiedAt: { not: null },
            role: { in: [UserRole.CUSTOMER, UserRole.ORGANIZER] },
          },
          select,
        });
      default:
        throw new BadRequestException('Unsupported audience');
    }
  }
}
