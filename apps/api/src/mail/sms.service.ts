import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * SMS via Termii (Nigeria). Set SMS_PROVIDER=log to log-only in dev.
 * https://developers.termii.com/nigeria
 */
@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);

  constructor(private readonly config: ConfigService) {}

  async send(to: string, text: string): Promise<void> {
    const provider = (
      this.config.get<string>('SMS_PROVIDER') ?? 'log'
    ).toLowerCase();

    if (provider === 'log') {
      this.logger.log(`[SMS log] to=${to} len=${text.length}`);
      return;
    }

    if (provider !== 'termii') {
      throw new Error(
        `Unknown SMS_PROVIDER="${provider}". Supported values: "termii", "log".`,
      );
    }

    // provider === 'termii' — key MUST be present
    const apiKey = this.config.get<string>('TERMII_API_KEY');
    if (!apiKey) {
      throw new Error(
        'SMS_PROVIDER=termii but TERMII_API_KEY is not set. ' +
          'Configure the key or change SMS_PROVIDER=log to suppress sending.',
      );
    }
    const from =
      this.config.get<string>('TERMII_SENDER_ID') ??
      this.config.get<string>('SMS_FROM') ??
      'Tamiym';

    // Normalise to digits-only; Termii expects number without leading +
    const normalized = to.replace(/^\+/, '').replace(/\D/g, '');
    if (normalized.length < 7 || normalized.length > 15) {
      throw new Error(
        `Invalid phone number "${to}": must be 7–15 digits in E.164 format`,
      );
    }

    const url = 'https://api.ng.termii.com/api/sms/send';
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: apiKey,
        to: normalized,
        from,
        sms: text.slice(0, 480),
        type: 'plain',
        channel: 'generic',
      }),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Termii SMS failed ${res.status}: ${body}`);
    }
  }
}
