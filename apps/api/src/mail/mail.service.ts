import { BadRequestException, Injectable } from '@nestjs/common';
import { join } from 'node:path';
import { MailTransportService } from './mail-transport.service';

// Simple RFC-5321 check: at least one character @ at least one character . at least 2 chars
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export interface SendSignupCodeEmailPayload {
  to: string;
  code: string;
  /** ISO time after which the code no longer works. */
  expiresAt: string;
}

export interface SendVerificationEmailPayload {
  to: string;
  verifyUrl: string;
}

export interface SendPasswordResetEmailPayload {
  to: string;
  resetUrl: string;
}

export interface SendGoogleLinkedPasswordRemovedEmailPayload {
  to: string;
  settingsUrl: string;
}

export interface SendGoogleLinkedAccountSuspendedEmailPayload {
  to: string;
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

  async sendSignupCodeEmail(
    payload: SendSignupCodeEmailPayload,
  ): Promise<void> {
    const { to, code } = payload;
    await this.sendTemplatedEmail({
      to,
      subject: 'Your Tamiym Workshop confirmation code',
      template: 'signup-code',
      context: { code },
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

  async sendGoogleLinkedPasswordRemovedEmail(
    payload: SendGoogleLinkedPasswordRemovedEmailPayload,
  ): Promise<void> {
    const { to, settingsUrl } = payload;
    await this.sendTemplatedEmail({
      to,
      subject: 'Your account is now linked to Google',
      template: 'google-linked-password-removed',
      context: { settingsUrl },
    });
  }

  async sendGoogleLinkedAccountSuspendedEmail(
    payload: SendGoogleLinkedAccountSuspendedEmailPayload,
  ): Promise<void> {
    await this.sendTemplatedEmail({
      to: payload.to,
      subject: 'Your account is linked to Google and currently blocked',
      template: 'google-linked-account-suspended',
      context: {},
    });
  }
}
