import type {
  ShippingRuleMatchType,
  ShippingRateProvider,
} from '../generated/prisma/enums';

export interface CanonicalShippingAddress {
  id: string;
  addressLine1: string;
  addressLine2: string | null;
  city: string;
  state: string;
  postalCode: string | null;
  country: string;
  countryCode: string;
  locality: string | null;
  dependentLocality: string | null;
  administrativeAreaLevel1: string | null;
  administrativeAreaLevel2: string | null;
  stateCode: string | null;
  lgaId: string | null;
}

export interface ShipmentSummaryLine {
  productId: string;
  variantId: string;
  quantity: number;
  weightGrams: number | null;
  packageLengthMm: number | null;
  packageWidthMm: number | null;
  packageHeightMm: number | null;
}

export interface ShipmentSummary {
  totalQuantity: number;
  totalWeightGrams: number | null;
  packageLengthMm: number | null;
  packageWidthMm: number | null;
  packageHeightMm: number | null;
  lineItems: ShipmentSummaryLine[];
}

export type ShippingResolutionConfidence = 'high' | 'medium' | 'low';

export interface ResolvedShippingDestination {
  countryCode: string;
  zoneId: string;
  zoneName: string;
  ruleId: string;
  matchType: ShippingRuleMatchType;
  matchValue: string;
  matchContext: string | null;
  resolutionMethod: string;
  confidence: ShippingResolutionConfidence;
  metadata?: Record<string, unknown>;
}

export interface ShippingQuoteRequest {
  destination: ResolvedShippingDestination;
  currency: string;
  serviceLevel?: string;
  shipment: ShipmentSummary;
  vatAppliedToShipping: boolean;
  now?: Date;
}

export interface ShippingQuoteBreakdown {
  version: 2;
  provider: ShippingRateProvider;
  rateSource: 'ZONE_FLAT_RATE';
  rateId: string;
  zoneId: string;
  zoneName: string;
  appliedFee: number;
  currency: string;
  serviceLevel: string;
  priority: number;
  vatAppliedToShipping: boolean;
  resolutionMethod: string;
  destination: {
    countryCode: string;
    ruleId: string;
    matchType: ShippingRuleMatchType;
    matchValue: string;
    matchContext: string | null;
    confidence: ShippingResolutionConfidence;
  };
  estimatedDeliveryMinDays: number | null;
  estimatedDeliveryMaxDays: number | null;
  shipmentSummary: ShipmentSummary;
  metadata?: Record<string, unknown>;
}

export interface ShippingRateProviderContract {
  supports(request: ShippingQuoteRequest): boolean | Promise<boolean>;
  quote(request: ShippingQuoteRequest): Promise<ShippingQuoteBreakdown | null>;
}
