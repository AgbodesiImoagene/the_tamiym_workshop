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
});
