import { BadRequestException, Injectable } from '@nestjs/common';
import { ShippingRateProvider } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type {
  ShippingQuoteBreakdown,
  ShippingQuoteRequest,
  ShippingRateProviderContract,
} from './shipping.types';

// Prisma generates a strict enum for the currency column.
// Map from the runtime string to the correct literal type.
const SUPPORTED_CURRENCIES = ['NGN'] as const;
type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

function assertSupportedCurrency(c: string): SupportedCurrency {
  if (!(SUPPORTED_CURRENCIES as readonly string[]).includes(c)) {
    throw new BadRequestException(
      `Unsupported shipping currency "${c}". Supported: ${SUPPORTED_CURRENCIES.join(', ')}`,
    );
  }
  return c as SupportedCurrency;
}

@Injectable()
export class InternalZoneRateProvider implements ShippingRateProviderContract {
  constructor(private readonly prisma: PrismaService) {}

  supports(request: ShippingQuoteRequest) {
    return request.destination.countryCode.length > 0;
  }

  async quote(
    request: ShippingQuoteRequest,
  ): Promise<ShippingQuoteBreakdown | null> {
    const now = request.now ?? new Date();
    const serviceLevel = request.serviceLevel ?? 'STANDARD';
    const rate = await this.prisma.shippingRate.findFirst({
      where: {
        zoneId: request.destination.zoneId,
        provider: ShippingRateProvider.INTERNAL,
        currency: assertSupportedCurrency(request.currency),
        serviceLevel,
        isActive: true,
        OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }],
        AND: [{ OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] }],
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });

    if (!rate) {
      return null;
    }

    return {
      version: 2,
      provider: ShippingRateProvider.INTERNAL,
      rateSource: 'ZONE_FLAT_RATE',
      rateId: rate.id,
      zoneId: request.destination.zoneId,
      zoneName: request.destination.zoneName,
      appliedFee: Number(rate.flatFee),
      currency: rate.currency,
      serviceLevel: rate.serviceLevel,
      priority: rate.priority,
      vatAppliedToShipping: request.vatAppliedToShipping,
      resolutionMethod: request.destination.resolutionMethod,
      destination: {
        countryCode: request.destination.countryCode,
        ruleId: request.destination.ruleId,
        matchType: request.destination.matchType,
        matchValue: request.destination.matchValue,
        matchContext: request.destination.matchContext,
        confidence: request.destination.confidence,
      },
      estimatedDeliveryMinDays: rate.minDeliveryDays ?? null,
      estimatedDeliveryMaxDays: rate.maxDeliveryDays ?? null,
      shipmentSummary: request.shipment,
      metadata: {
        destinationMetadata: request.destination.metadata ?? null,
      },
    };
  }
}
