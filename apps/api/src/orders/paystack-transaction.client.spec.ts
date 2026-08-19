import { BadRequestException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  PaystackTransactionClient,
  PaystackTransientError,
} from './paystack-transaction.client';

describe('PaystackTransactionClient', () => {
  const params = {
    email: 'cust@example.com',
    amountKobo: 250_000,
    reference: 'ord_ref_1',
    callbackUrl: 'http://localhost/confirm',
    metadata: { orderId: 'ord_1' },
    idempotencyKey: 'ord_ref_1',
  };

  function clientWithKey(key: string | undefined): PaystackTransactionClient {
    return new PaystackTransactionClient({
      get: jest.fn(() => key),
    } as unknown as ConfigService);
  }

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('throws when Paystack is not configured', async () => {
    const client = clientWithKey(undefined);
    await expect(client.initialize(params)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('returns authorization data on success', async () => {
    const client = clientWithKey('sk_test');
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: true,
        data: {
          authorization_url: 'https://checkout.paystack.com/x',
          reference: 'ord_ref_1',
          access_code: 'ac_1',
        },
      }),
    } as Response);

    await expect(client.initialize(params)).resolves.toEqual({
      authorizationUrl: 'https://checkout.paystack.com/x',
      reference: 'ord_ref_1',
      accessCode: 'ac_1',
    });
    expect(fetch).toHaveBeenCalledWith(
      'https://api.paystack.co/transaction/initialize',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk_test',
          'Idempotency-Key': 'ord_ref_1',
        }),
      }),
    );
  });

  it('maps network failures to PaystackTransientError', async () => {
    const client = clientWithKey('sk_test');
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('socket hang up'));
    await expect(client.initialize(params)).rejects.toBeInstanceOf(
      PaystackTransientError,
    );
  });

  it('maps non-Error network failures to a default transient message', async () => {
    const client = clientWithKey('sk_test');
    jest.spyOn(global, 'fetch').mockRejectedValue('boom');
    await expect(client.initialize(params)).rejects.toMatchObject({
      message: 'Paystack initialize network error',
    });
  });

  it('maps 5xx responses to PaystackTransientError', async () => {
    const client = clientWithKey('sk_test');
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({ message: 'upstream down' }),
    } as Response);

    await expect(client.initialize(params)).rejects.toMatchObject({
      name: 'PaystackTransientError',
      message: 'upstream down',
    });
  });

  it('uses a default message when 5xx body has no message', async () => {
    const client = clientWithKey('sk_test');
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    await expect(client.initialize(params)).rejects.toMatchObject({
      message: 'Paystack initialize failed (502)',
    });
  });

  it('maps 4xx responses to BadRequestException', async () => {
    const client = clientWithKey('sk_test');
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({ message: 'Invalid email' }),
    } as Response);

    await expect(client.initialize(params)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('uses a default message when 4xx body has no message', async () => {
    const client = clientWithKey('sk_test');
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => {
        throw new Error('not json');
      },
    } as unknown as Response);

    await expect(client.initialize(params)).rejects.toMatchObject({
      message: 'Failed to initialize payment',
    });
  });

  it('rejects success payloads without authorization_url', async () => {
    const client = clientWithKey('sk_test');
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        status: false,
        message: 'Invalid response from payment provider',
      }),
    } as Response);

    await expect(client.initialize(params)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('rejects ok responses with missing data and default message', async () => {
    const client = clientWithKey('sk_test');
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: true, data: {} }),
    } as Response);

    await expect(client.initialize(params)).rejects.toMatchObject({
      message: 'Invalid response from payment provider',
    });
  });
});
