import { join } from 'node:path';
import { buildMailTemplateRenderer } from './mail-template.factory';
import { MailTransportService } from './mail-transport.service';
import { MailService } from './mail.service';

describe('MailService', () => {
  it('rejects invalid addresses and sends templated mail', async () => {
    const mailer = {
      sendMail: jest.fn().mockResolvedValue(undefined),
    } as unknown as MailTransportService;
    const service = new MailService(mailer);

    await expect(
      service.sendTemplatedEmail({
        to: 'not-an-email',
        subject: 'x',
        template: 'verification',
        context: {},
      }),
    ).rejects.toThrow(/Invalid email/);

    await service.sendVerificationEmail({
      to: 'user@example.com',
      token: 't',
      verifyUrl: 'https://example.com/v',
    });
    expect(mailer.sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        template: 'verification',
      }),
    );
  });

  describe('Google-linked password-removed notice (TTW-179)', () => {
    it('sends the notice template to the account address', async () => {
      const mailer = {
        sendMail: jest.fn().mockResolvedValue(undefined),
      } as unknown as MailTransportService;
      const service = new MailService(mailer);

      await service.sendGoogleLinkedPasswordRemovedEmail({
        to: 'owner@example.com',
        settingsUrl: 'https://shop.example.com/dashboard/settings',
      });

      expect(mailer.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@example.com',
          subject: 'Your account is now linked to Google',
          template: 'google-linked-password-removed',
          context: {
            settingsUrl: 'https://shop.example.com/dashboard/settings',
          },
        }),
      );
    });

    it('renders English text about Google, the removed password, addresses and phone', () => {
      const previousEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      try {
        const renderer = buildMailTemplateRenderer(
          join(__dirname, 'templates'),
        );
        const html = renderer.render('google-linked-password-removed', {
          settingsUrl: 'https://shop.example.com/dashboard/settings',
        });
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

        expect(text).toContain('linked to Google');
        expect(text).toMatch(/password .*removed/i);
        expect(text).toMatch(/addresses/i);
        expect(text).toMatch(/phone number/i);
        expect(html).toContain(
          'href="https://shop.example.com/dashboard/settings"',
        );
        expect(html).not.toMatch(/token=|reset-password/i);
      } finally {
        process.env.NODE_ENV = previousEnv;
      }
    });
  });

  describe('Google-linked account-suspended notice (TTW-179)', () => {
    it('sends the suspended notice template to the account address', async () => {
      const mailer = {
        sendMail: jest.fn().mockResolvedValue(undefined),
      } as unknown as MailTransportService;
      const service = new MailService(mailer);

      await service.sendGoogleLinkedAccountSuspendedEmail({
        to: 'owner@example.com',
      });

      expect(mailer.sendMail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: 'owner@example.com',
          subject: 'Your account is linked to Google and currently blocked',
          template: 'google-linked-account-suspended',
          context: {},
        }),
      );
    });

    it('renders English text: linked to Google, password removed, blocked, contact support', () => {
      const previousEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';
      try {
        const renderer = buildMailTemplateRenderer(
          join(__dirname, 'templates'),
        );
        const html = renderer.render('google-linked-account-suspended', {});
        const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

        expect(text).toContain('linked to Google');
        expect(text).toMatch(/password .*removed/i);
        expect(text).toMatch(/blocked/i);
        expect(text).toMatch(/contact our support team/i);
        expect(html).not.toMatch(/token=|reset-password/i);
      } finally {
        process.env.NODE_ENV = previousEnv;
      }
    });
  });
});
