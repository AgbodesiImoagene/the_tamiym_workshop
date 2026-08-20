import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Transporter } from 'nodemailer';
import {
  buildMailTemplateRenderer,
  buildMailTransportConfig,
  createMailTransporter,
} from './mail-template.factory';

export type SendMailParams = {
  to: string;
  subject: string;
  template: string;
  context: Record<string, unknown>;
  attachments?: {
    filename: string;
    path: string;
    cid: string;
  }[];
};

/**
 * Nodemailer + Handlebars transport. Replaces `@nestjs-modules/mailer` so
 * unused template engines (liquidjs/mjml) are not pulled into production.
 */
@Injectable()
export class MailTransportService implements OnModuleDestroy {
  private readonly transporter: Transporter;
  private readonly from: string;
  private readonly renderer: ReturnType<typeof buildMailTemplateRenderer>;

  constructor(config: ConfigService) {
    const transportConfig = buildMailTransportConfig(config);
    this.from = transportConfig.from;
    this.transporter = createMailTransporter(transportConfig);
    this.renderer = buildMailTemplateRenderer();
  }

  async sendMail(params: SendMailParams): Promise<void> {
    const html = this.renderer.render(params.template, params.context);
    await this.transporter.sendMail({
      from: this.from,
      to: params.to,
      subject: params.subject,
      html,
      attachments: params.attachments,
    });
  }

  onModuleDestroy(): void {
    this.transporter.close();
  }
}
