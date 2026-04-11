import { Injectable, Logger } from '@nestjs/common';
import Handlebars from 'handlebars';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationOutboxDeliveryService } from '../mail/notification-outbox-delivery.service';
import { OUTBOX_EVENT_ADMIN_OPERATIONAL } from '../mail/mail-outbox-templates';
import { ADMIN_NOTIFICATION_DEFAULTS } from './admin-notification-defaults';

const formatAmount = (amount: unknown, currency: unknown): string => {
  const n = typeof amount === 'number' ? amount : Number(amount);
  const c = typeof currency === 'string' && currency ? currency : 'NGN';
  if (!Number.isFinite(n)) return `${c} —`;
  try {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: c,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${c} ${n}`;
  }
};

@Injectable()
export class AdminNotifyService {
  private readonly logger = new Logger(AdminNotifyService.name);
  private readonly hb = Handlebars.create();

  constructor(
    private readonly prisma: PrismaService,
    private readonly outboxDelivery: NotificationOutboxDeliveryService,
  ) {
    this.hb.registerHelper('formatAmount', formatAmount);
  }

  /**
   * Fan out to all enabled `AdminNotificationRoute` rows for this event key.
   */
  async emit(
    eventKey: string,
    context: Record<string, unknown>,
  ): Promise<void> {
    const routes = await this.prisma.adminNotificationRoute.findMany({
      where: { eventKey, enabled: true },
    });
    if (routes.length === 0) return;

    const defaults = ADMIN_NOTIFICATION_DEFAULTS[eventKey];
    if (!defaults) {
      this.logger.error(
        `No built-in defaults for eventKey=${eventKey} — admin alert will NOT be sent. ` +
          'Add an entry to ADMIN_NOTIFICATION_DEFAULTS.',
      );
      return;
    }

    for (const route of routes) {
      const subjectTpl = route.subjectTemplate ?? defaults.subject;
      const emailBodyTpl = route.emailBodyTemplate ?? defaults.emailBody;
      const smsBodyTpl = route.smsBodyTemplate ?? defaults.smsBody;

      const subject = this.hb.compile(subjectTpl)(context);
      // Do NOT pass noEscape:true — user-controlled fields (campaign titles,
      // rejection reasons, etc.) in `context` would otherwise inject HTML into
      // admin emails. Templates that intentionally need raw HTML should use
      // triple-brace syntax {{{rawField}}}.
      const emailHtml = this.hb.compile(emailBodyTpl)(context);
      const smsText = this.hb.compile(smsBodyTpl)(context).slice(0, 480);

      if (route.notifyEmail && route.emailRecipients.length > 0) {
        for (const to of route.emailRecipients) {
          const trimmed = to.trim();
          if (!trimmed) continue;
          const row = await this.prisma.notificationOutbox.create({
            data: {
              eventName: OUTBOX_EVENT_ADMIN_OPERATIONAL,
              channel: 'EMAIL',
              recipient: trimmed,
              payload: {
                subject,
                html: emailHtml,
                eventKey,
                routeId: route.id,
              },
              status: 'PENDING',
            },
          });
          await this.outboxDelivery.enqueueDelivery(row.id);
        }
      }

      if (route.notifySms && route.smsRecipients.length > 0) {
        for (const to of route.smsRecipients) {
          const trimmed = to.trim();
          if (!trimmed) continue;
          const row = await this.prisma.notificationOutbox.create({
            data: {
              eventName: OUTBOX_EVENT_ADMIN_OPERATIONAL,
              channel: 'SMS',
              recipient: trimmed,
              payload: { text: smsText, eventKey, routeId: route.id },
              status: 'PENDING',
            },
          });
          await this.outboxDelivery.enqueueDelivery(row.id);
        }
      }

      if (route.notifySlack && route.slackWebhookUrl?.trim()) {
        const url = route.slackWebhookUrl.trim();
        const row = await this.prisma.notificationOutbox.create({
          data: {
            eventName: OUTBOX_EVENT_ADMIN_OPERATIONAL,
            channel: 'SLACK',
            recipient: url,
            payload: {
              text: `*${subject}*\n${smsText}`,
              eventKey,
              routeId: route.id,
            },
            status: 'PENDING',
          },
        });
        await this.outboxDelivery.enqueueDelivery(row.id);
      }
    }
  }
}
