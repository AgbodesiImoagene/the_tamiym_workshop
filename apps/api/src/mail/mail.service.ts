import { BadRequestException, Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { MailTransportService } from './mail-transport.service';

// Simple RFC-5321 check: at least one character @ at least one character . at least 2 chars
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface SendVerificationEmailPayload {
  to: string;
  token: string;
  verifyUrl: string;
}

export interface SendPasswordResetEmailPayload {
  to: string;
  resetUrl: string;
}

export interface SendTemplatedEmailParams {
  to: string;
  subject: string;
  template: string;
  context: Record<string, unknown>;
}

@Injectable()
export class MailService {
  private readonly logoPath = join(
    __dirname,
    'assets',
    'logo-lockup-light.png',
  );

  constructor(private readonly mailer: MailTransportService) {}

  private logoAttachments() {
    return [
      {
        filename: 'logo.png',
        path: this.logoPath,
        cid: 'logo',
      },
    ];
  }

  async sendTemplatedEmail(params: SendTemplatedEmailParams): Promise<void> {
    const { to, subject, template, context } = params;
    if (!EMAIL_RE.test(to)) {
      throw new BadRequestException(`Invalid email address: ${to}`);
    }
    await this.mailer.sendMail({
      to,
      subject,
      template,
      context,
      attachments: this.logoAttachments(),
    });
  }

  async sendVerificationEmail(
    payload: SendVerificationEmailPayload,
  ): Promise<void> {
    const { to, verifyUrl } = payload;
    await this.sendTemplatedEmail({
      to,
      subject: 'Verify your email',
      template: 'verification',
      context: { verifyUrl },
    });
  }

  async sendPasswordResetEmail(
    payload: SendPasswordResetEmailPayload,
  ): Promise<void> {
    const { to, resetUrl } = payload;
    await this.sendTemplatedEmail({
      to,
      subject: 'Reset your password',
      template: 'password-reset',
      context: { resetUrl },
    });
  }
}
