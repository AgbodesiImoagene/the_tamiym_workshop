import { Injectable, BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type PaystackCreateRefundResult = {
  /** Paystack refund id (numeric as string). */
  providerRefundId: string;
  /** Provider-reported status: pending | processing | processed | failed | needs-attention. */
  providerStatus: string;
  refundReference: string | null;
  transactionReference: string;
  amountKobo: number;
  currency: string;
};

/** Transient provider/network failure — keep INITIATED and let the admin retry. */
export class PaystackRefundTransientError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PaystackRefundTransientError';
  }
}

const REFUND_TIMEOUT_MS = 20_000;

/**
 * Thin Paystack Refund API client. Injectable so tests can delay/fail the
 * provider without hitting the live network (TTW-013).
 */
@Injectable()
export class PaystackRefundClient {
  constructor(private config: ConfigService) {}

  async createRefund(params: {
    transactionReference: string;
    amountKobo: number;
    customerNote?: string;
    merchantNote?: string;
    idempotencyKey?: string;
  }): Promise<PaystackCreateRefundResult> {
    const secretKey = this.config.get<string>('PAYSTACK_SECRET_KEY');
    if (!secretKey) {
      throw new BadRequestException('Payment provider is not configured');
    }

    let response: Response;
    try {
      response = await fetch('https://api.paystack.co/refund', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
          ...(params.idempotencyKey
            ? { 'Idempotency-Key': params.idempotencyKey }
            : {}),
        },
        body: JSON.stringify({
          transaction: params.transactionReference,
          amount: params.amountKobo,
          customer_note: params.customerNote,
          merchant_note: params.merchantNote,
        }),
        signal: AbortSignal.timeout(REFUND_TIMEOUT_MS),
      });
    } catch (error) {
      throw new PaystackRefundTransientError(
        error instanceof Error
          ? error.message
          : 'Paystack refund network error',
      );
    }

    if (response.status >= 500) {
      const err = (await response.json().catch(() => ({}))) as {
        message?: string;
      };
      throw new PaystackRefundTransientError(
        err.message || `Paystack refund failed (${response.status})`,
      );
    }

    const data = (await response.json().catch(() => ({}))) as {
      status?: boolean;
      message?: string;
      data?: {
        id?: number;
        status?: string;
        amount?: number | string;
        currency?: string;
        transaction?: { reference?: string } | number;
        refund_reference?: string | null;
        transaction_reference?: string;
      };
    };

    if (!response.ok || !data.status || data.data?.id == null) {
      throw new BadRequestException(
        data.message ?? 'Paystack refund request failed',
      );
    }

    const transactionReference =
      data.data.transaction_reference ??
      (typeof data.data.transaction === 'object'
        ? (data.data.transaction?.reference ?? params.transactionReference)
        : params.transactionReference);

    return {
      providerRefundId: String(data.data.id),
      providerStatus: data.data.status ?? 'pending',
      refundReference: data.data.refund_reference ?? null,
      transactionReference,
      amountKobo:
        typeof data.data.amount === 'string'
          ? Number(data.data.amount)
          : (data.data.amount ?? params.amountKobo),
      currency: data.data.currency ?? 'NGN',
    };
  }
}
