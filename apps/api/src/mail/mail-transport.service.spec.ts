import type { ConfigService } from '@nestjs/config';
import { MailTransportService } from './mail-transport.service';

const sendMail = jest.fn().mockResolvedValue(undefined);
const close = jest.fn();

jest.mock('nodemailer', () => ({
  __esModule: true,
  default: {
    createTransport: jest.fn(() => ({ sendMail, close })),
  },
}));

describe('MailTransportService', () => {
  const previousEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = previousEnv;
    jest.clearAllMocks();
  });

  it('renders templates and sends via nodemailer', async () => {
    process.env.NODE_ENV = 'test';
    const config = {
      get: jest.fn((key: string, fallback?: unknown) => fallback),
    } as unknown as ConfigService;

    const transport = new MailTransportService(config);
    await transport.sendMail({
      to: 'a@b.com',
      subject: 'Hello',
      template: 'verification',
      context: { verifyUrl: 'https://example.com' },
    });

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'a@b.com',
        subject: 'Hello',
        html: expect.stringContaining('e2e test template stub'),
      }),
    );

    transport.onModuleDestroy();
    expect(close).toHaveBeenCalled();
  });
});
