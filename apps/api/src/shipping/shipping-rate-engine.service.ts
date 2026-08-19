import { Injectable } from '@nestjs/common';
import { InternalZoneRateProvider } from './internal-zone-rate-provider.service';
import type {
  ShippingQuoteBreakdown,
  ShippingQuoteRequest,
} from './shipping.types';

@Injectable()
export class ShippingRateEngine {
  constructor(
    private readonly internalZoneRateProvider: InternalZoneRateProvider,
  ) {}

  async quote(
    request: ShippingQuoteRequest,
  ): Promise<ShippingQuoteBreakdown | null> {
    const providers = [this.internalZoneRateProvider];

    for (const provider of providers) {
      const supported = await Promise.resolve(provider.supports(request));
      if (!supported) {
        continue;
      }
      const quote = await provider.quote(request);
      if (quote) {
        return quote;
      }
    }

    return null;
  }
}
