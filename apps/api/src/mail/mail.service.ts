import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

export interface SendVerificationEmailPayload {
  to: string;
  token: string;
  verifyUrl: string;
}

export interface SendPasswordResetEmailPayload {
  to: string;
  resetUrl: string;
}

@Injectable()
export class MailService {
  constructor(private readonly mailer: MailerService) {}

  /**
   * Send email verification message with link containing token.
   */
  async sendVerificationEmail(
    payload: SendVerificationEmailPayload,
  ): Promise<void> {
    const { to, verifyUrl } = payload;
    await this.mailer.sendMail({
      to,
      subject: 'Verify your email',
      html: `
        <p>Thanks for signing up. Please verify your email by clicking the link below.</p>
        <p><a href="${verifyUrl}">Verify email</a></p>
        <p>This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>
      `,
    });
  }

  /**
   * Send password reset email with link containing token.
   */
  async sendPasswordResetEmail(
    payload: SendPasswordResetEmailPayload,
  ): Promise<void> {
    const { to, resetUrl } = payload;
    await this.mailer.sendMail({
      to,
      subject: 'Reset your password',
      html: `
        <p>You requested a password reset. Click the link below to set a new password.</p>
        <p><a href="${resetUrl}">Reset password</a></p>
        <p>This link expires in 1 hour. If you didn't request this, you can ignore this email.</p>
      `,
    });
  }
}
