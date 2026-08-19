import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PaystackInitializeResult = {
  authorizationUrl: string;
  reference: string;
  accessCode: string;
};

/** Transient provider/network failure — keep PENDING and let the client retry. */
export class PaystackTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaystackTransientError';
  }
}

const INITIALIZE_TIMEOUT_MS = 20_000;

/**
 * Thin Paystack Transaction API client (initialize). Injectable so tests can
 * delay/fail the provider without hitting the live network (TTW-012).
 */
@Injectable()
export class PaystackTransactionClient {
  constructor(private config: ConfigService) {}

  async initialize(params: {
    email: string;
    amountKobo: number;
    reference: string;
    callbackUrl: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
  }): Promise<PaystackInitializeResult> {
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');
    if (!secretKey) {
      throw new BadRequestException('Payment provider is not configured');
    }

    let response: Response;
    try {
      response = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': params.idempotencyKey,
        },
        body: JSON.stringify({
          email: params.email,
          amount: params.amountKobo,
          reference: params.reference,
          callback_url: params.callbackUrl,
          metadata: params.metadata,
        }),
        signal: AbortSignal.timeout(INITIALIZE_TIMEOUT_MS),
      });
    } catch (error) {
      throw new PaystackTransientError(
        error instanceof Error
          ? error.message
          : 'Paystack initialize network error',
      );
    }

    if (response.status >= 500) {
      const err = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      throw new PaystackTransientError(
        err.message || `Paystack initialize failed (${response.status})`,
      );
    }

    if (!response.ok) {
      const err = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      throw new BadRequestException(
        err.message || 'Failed to initialize payment',
      );
    }

    const data = (await response.json()) as {
      status?: boolean;
      data?: {
        authorization_url: string;
        reference: string;
        access_code: string;
      };
      message?: string;
    };
    if (!data.status || !data.data?.authorization_url) {
      throw new BadRequestException(
        data.message || 'Invalid response from payment provider',
      );
    }

    return {
      authorizationUrl: data.data.authorization_url,
      reference: data.data.reference,
      accessCode: data.data.access_code,
    };
  }
}
