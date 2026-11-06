import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ObservabilityService } from '../observability/observability.service';
import { PaystackTransferProviderService } from './paystack-transfer.provider';

describe('PaystackTransferProviderService.listBanks', () => {
  const originalFetch = globalThis.fetch;
  let provider: PaystackTransferProviderService;
  let warn: jest.SpyInstance;

  function mockPaystackResponse(body: unknown) {
    globalThis.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve(body),
    });
  }

  beforeEach(() => {
    provider = new PaystackTransferProviderService(
      {
        get: (key: string) =>
          key === 'PAYSTACK_SECRET_KEY' ? 'sk_test' : undefined,
      } as ConfigService,
      {
        startSpan: (
          _name: string,
          _attributes: unknown,
          run: () => Promise<unknown>,
        ) => run(),
      } as unknown as ObservabilityService,
    );
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('returns the code and name of every bank that has a code', async () => {
    mockPaystackResponse({
      status: true,
      data: [
        { id: 1, name: 'Access Bank', code: '044', slug: 'access-bank' },
        { id: 2, name: 'Guaranty Trust Bank', code: '058' },
      ],
    });

    await expect(provider.listBanks()).resolves.toEqual([
      { code: '044', name: 'Access Bank' },
      { code: '058', name: 'Guaranty Trust Bank' },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it('drops entries with an empty, blank, null or missing code and logs how many', async () => {
    mockPaystackResponse({
      status: true,
      data: [
        { name: 'Empty code', code: '' },
        { name: 'Blank code', code: '   ' },
        { name: 'Access Bank', code: '044' },
        { name: 'Null code', code: null },
        { name: 'Missing code' },
      ],
    });

    await expect(provider.listBanks()).resolves.toEqual([
      { code: '044', name: 'Access Bank' },
    ]);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      'Paystack bank list: skipped 4 entries without a code',
    );
  });

  it('returns an empty list when Paystack reports a failure', async () => {
    mockPaystackResponse({ status: false, message: 'Invalid key' });

    await expect(provider.listBanks()).resolves.toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });
});
