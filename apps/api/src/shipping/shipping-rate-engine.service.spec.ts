import { ShippingRateEngine } from './shipping-rate-engine.service';
import type { InternalZoneRateProvider } from './internal-zone-rate-provider.service';
import type { ShippingQuoteRequest } from './shipping.types';

describe('ShippingRateEngine', () => {
  const request = {
    destination: { countryCode: 'NG' },
  } as ShippingQuoteRequest;

  it('returns null when no provider supports the request', async () => {
    const provider = {
      supports: jest.fn().mockReturnValue(false),
      quote: jest.fn(),
    } as unknown as InternalZoneRateProvider;

    const engine = new ShippingRateEngine(provider);
    await expect(engine.quote(request)).resolves.toBeNull();
    expect(provider.quote).not.toHaveBeenCalled();
  });

  it('returns the first successful quote from a supporting provider', async () => {
    const quote = {
      provider: 'INTERNAL_ZONE',
      amount: 1500,
      currency: 'NGN',
      estimatedDaysMin: 2,
      estimatedDaysMax: 5,
    };
    const provider = {
      supports: jest.fn().mockResolvedValue(true),
      quote: jest.fn().mockResolvedValue(quote),
    } as unknown as InternalZoneRateProvider;

    const engine = new ShippingRateEngine(provider);
    await expect(engine.quote(request)).resolves.toEqual(quote);
  });

  it('continues when a supporting provider returns a null quote', async () => {
    const provider = {
      supports: jest.fn().mockReturnValue(true),
      quote: jest.fn().mockResolvedValue(null),
    } as unknown as InternalZoneRateProvider;

    const engine = new ShippingRateEngine(provider);
    await expect(engine.quote(request)).resolves.toBeNull();
  });
});
