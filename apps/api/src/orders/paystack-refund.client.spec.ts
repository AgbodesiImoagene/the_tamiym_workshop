import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaystackRefundClient,
  PaystackRefundTransientError,
} from './paystack-refund.client';

describe('PaystackRefundClient', () => {
  const originalFetch = globalThis.fetch;
  let client: PaystackRefundClient;

  beforeEach(() => {
    client = new PaystackRefundClient({
      get: (key: string) =>
        key === 'PAYSTACK_SECRET_KEY' ? 'sk_test' : undefined,
    } as ConfigService);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('creates a refund and maps provider fields', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () =>
        Promise.resolve({
          status: true,
          data: {
            id: 42,
            status: 'pending',
            amount: 150000,
            currency: 'NGN',
            transaction_reference: 'txn_abc',
            refund_reference: null,
          },
        }),
    });

    const result = await client.createRefund({
      transactionReference: 'txn_abc',
      amountKobo: 150000,
      customerNote: 'test',
    });

    expect(result.providerRefundId).toBe('42');
    expect(result.providerStatus).toBe('pending');
    expect(result.transactionReference).toBe('txn_abc');
  });

  it('throws BadRequestException when provider is not configured', async () => {
    client = new PaystackRefundClient({
      get: () => undefined,
    } as unknown as ConfigService);
    await expect(
      client.createRefund({
        transactionReference: 'txn',
        amountKobo: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws transient error on 5xx', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => Promise.resolve({ message: 'unavailable' }),
    });
    await expect(
      client.createRefund({
        transactionReference: 'txn',
        amountKobo: 100,
      }),
    ).rejects.toBeInstanceOf(PaystackRefundTransientError);
  });

  it('throws BadRequestException on hard 4xx', async () => {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () =>
        Promise.resolve({ status: false, message: 'bad request' }),
    });
    await expect(
      client.createRefund({
        transactionReference: 'txn',
        amountKobo: 100,
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('throws transient error on network failure', async () => {
    globalThis.fetch = jest.fn().mockRejectedValue(new Error('ECONNRESET'));
    await expect(
      client.createRefund({
        transactionReference: 'txn',
        amountKobo: 100,
      }),
    ).rejects.toBeInstanceOf(PaystackRefundTransientError);
  });
});
