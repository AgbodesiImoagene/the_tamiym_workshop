import { BadRequestException, Injectable } from '@nestjs/common';
import { ShippingRateProvider } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { shippingWeightUnknown } from './shipping.errors';
import type {
  ShipmentSummary,
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
      include: { brackets: { orderBy: { minValue: 'asc' } } },
    });

    if (!rate) {
      return null;
    }

    const { appliedFee, bracket } = this.resolveFee(rate, request.shipment);

    return {
      version: 2,
      provider: ShippingRateProvider.INTERNAL,
      rateSource: bracket ? 'ZONE_BRACKET_RATE' : 'ZONE_FLAT_RATE',
      ...(bracket ? { bracket } : {}),
      rateId: rate.id,
      zoneId: request.destination.zoneId,
      zoneName: request.destination.zoneName,
      appliedFee,
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

  /**
   * TTW-098: the flat fee, unless the rate has a basis and the shipment reaches
   * one of its brackets. The highest bracket whose minimum is reached wins; a
   * shipment below the first bracket pays the flat fee. A weight rate with an
   * unknown product weight is refused, never guessed.
   */
  private resolveFee(
    rate: {
      flatFee: unknown;
      bracketBasis: 'WEIGHT_GRAMS' | 'QUANTITY' | null;
      brackets: Array<{ minValue: number; fee: unknown }>;
    },
    shipment: ShipmentSummary,
  ): { appliedFee: number; bracket?: ShippingQuoteBreakdown['bracket'] } {
    const flatFee = Number(rate.flatFee);
    if (!rate.bracketBasis || rate.brackets.length === 0) {
      return { appliedFee: flatFee };
    }

    const measuredValue =
      rate.bracketBasis === 'QUANTITY'
        ? shipment.totalQuantity
        : shipment.totalWeightGrams;
    if (measuredValue == null) {
      throw shippingWeightUnknown();
    }

    let reached: { minValue: number; fee: unknown } | null = null;
    for (const candidate of rate.brackets) {
      if (
        candidate.minValue <= measuredValue &&
        (!reached || candidate.minValue > reached.minValue)
      ) {
        reached = candidate;
      }
    }
    if (!reached) {
      return { appliedFee: flatFee };
    }
    return {
      appliedFee: Number(reached.fee),
      bracket: {
        basis: rate.bracketBasis,
        minValue: reached.minValue,
        measuredValue,
      },
    };
  }
}
