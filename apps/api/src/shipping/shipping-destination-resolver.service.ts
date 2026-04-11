import { Injectable } from '@nestjs/common';
import { ShippingRuleMatchType } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type {
  CanonicalShippingAddress,
  ResolvedShippingDestination,
  ShippingResolutionConfidence,
} from './shipping.types';

@Injectable()
export class ShippingDestinationResolver {
  constructor(private readonly prisma: PrismaService) {}

  async resolveAddress(
    address: CanonicalShippingAddress,
  ): Promise<ResolvedShippingDestination | null> {
    const rules = await this.prisma.shippingZoneRule.findMany({
      where: {
        countryCode: address.countryCode,
        isActive: true,
        zone: { isActive: true },
      },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
      include: {
        zone: { select: { id: true, name: true } },
      },
    });

    // For ADMIN2 rules, pre-fetch GeoLga records so that matchValues stored as
    // LGA IDs (cuid) still resolve against addresses that only carry a human
    // name in administrativeAreaLevel2 (and vice-versa).
    const admin2MatchValues = rules
      .filter((r) => r.matchType === ShippingRuleMatchType.ADMIN2)
      .map((r) => r.matchValue);
    const lgaNameById = new Map<string, string>();
    if (admin2MatchValues.length > 0) {
      const lgas = await this.prisma.geoLga.findMany({
        where: { id: { in: admin2MatchValues } },
        select: { id: true, name: true },
      });
      for (const lga of lgas) {
        lgaNameById.set(lga.id, this.normalizeKey(lga.name));
      }
    }

    for (const rule of rules) {
      if (!this.ruleMatchesAddress(rule, address, lgaNameById)) {
        continue;
      }
      return {
        countryCode: address.countryCode,
        zoneId: rule.zone.id,
        zoneName: rule.zone.name,
        ruleId: rule.id,
        matchType: rule.matchType,
        matchValue: rule.matchValue,
        matchContext: rule.matchContext,
        resolutionMethod: `RULE_${rule.matchType}`,
        confidence: this.confidenceForMatchType(rule.matchType),
        metadata: {
          priority: rule.priority,
        },
      };
    }

    if (address.countryCode === 'NG') {
      return this.resolveLegacyNigeriaArea(address);
    }

    return null;
  }

  private ruleMatchesAddress(
    rule: {
      matchType: ShippingRuleMatchType;
      matchValue: string;
      matchContext: string | null;
    },
    address: CanonicalShippingAddress,
    lgaNameById: Map<string, string> = new Map(),
  ) {
    const postalCode = this.normalizePostalCode(address.postalCode);
    const stateCode = address.stateCode?.toUpperCase() ?? null;
    const admin1 = this.normalizeKey(
      address.administrativeAreaLevel1 ?? address.state,
    );
    const admin2 = this.normalizeKey(address.administrativeAreaLevel2);
    const city = this.normalizeKey(address.locality ?? address.city);

    switch (rule.matchType) {
      case ShippingRuleMatchType.ADMIN2: {
        // ID-to-ID: exact match when both sides carry an LGA ID
        if (address.lgaId && rule.matchValue === address.lgaId) {
          return !rule.matchContext || rule.matchContext === stateCode;
        }
        // ID-to-name bridge: rule stores a GeoLga ID but address only has a
        // human name in administrativeAreaLevel2 (e.g. addresses from
        // Google Maps geocoding that weren't enriched with lgaId).
        if (lgaNameById.has(rule.matchValue)) {
          const lgaNormName = lgaNameById.get(rule.matchValue)!;
          if (lgaNormName === admin2) {
            return (
              !rule.matchContext ||
              rule.matchContext === stateCode ||
              this.normalizeKey(rule.matchContext) === admin1
            );
          }
        }
        // Name-to-name fallback
        return (
          this.normalizeKey(rule.matchValue) === admin2 &&
          (!rule.matchContext ||
            rule.matchContext === stateCode ||
            this.normalizeKey(rule.matchContext) === admin1)
        );
      }
      case ShippingRuleMatchType.ADMIN1:
        return (
          rule.matchValue === stateCode ||
          this.normalizeKey(rule.matchValue) === admin1
        );
      case ShippingRuleMatchType.CITY:
        return (
          this.normalizeKey(rule.matchValue) === city &&
          (!rule.matchContext ||
            rule.matchContext === stateCode ||
            this.normalizeKey(rule.matchContext) === admin1)
        );
      case ShippingRuleMatchType.POSTAL_CODE:
        return this.normalizePostalCode(rule.matchValue) === postalCode;
      case ShippingRuleMatchType.POSTAL_PREFIX:
        return postalCode.startsWith(this.normalizePostalCode(rule.matchValue));
      default:
        return false;
    }
  }

  private async resolveLegacyNigeriaArea(
    address: CanonicalShippingAddress,
  ): Promise<ResolvedShippingDestination | null> {
    if (!address.stateCode) {
      return null;
    }

    const area = await this.prisma.shippingZoneArea.findFirst({
      where: {
        stateCode: address.stateCode,
        OR: [
          ...(address.lgaId ? [{ lgaId: address.lgaId }] : []),
          { lgaId: null },
        ],
        zone: { isActive: true },
      },
      orderBy: [{ lgaId: 'desc' }],
      include: {
        zone: { select: { id: true, name: true } },
      },
    });

    if (!area) {
      return null;
    }

    return {
      countryCode: 'NG',
      zoneId: area.zone.id,
      zoneName: area.zone.name,
      ruleId: `legacy-area:${area.id}`,
      matchType: area.lgaId
        ? ShippingRuleMatchType.ADMIN2
        : ShippingRuleMatchType.ADMIN1,
      matchValue: area.lgaId ?? area.stateCode,
      matchContext: area.lgaId ? area.stateCode : null,
      resolutionMethod: 'LEGACY_NIGERIA_AREA',
      confidence: area.lgaId ? 'high' : 'medium',
      metadata: {
        legacyAreaId: area.id,
      },
    };
  }

  private confidenceForMatchType(
    matchType: ShippingRuleMatchType,
  ): ShippingResolutionConfidence {
    switch (matchType) {
      case ShippingRuleMatchType.ADMIN2:
      case ShippingRuleMatchType.POSTAL_CODE:
        return 'high';
      case ShippingRuleMatchType.ADMIN1:
      case ShippingRuleMatchType.POSTAL_PREFIX:
        return 'medium';
      case ShippingRuleMatchType.CITY:
      default:
        return 'low';
    }
  }

  private normalizeKey(value: string | null | undefined) {
    return value?.trim().toLowerCase().replace(/\s+/g, ' ') ?? '';
  }

  private normalizePostalCode(value: string | null | undefined) {
    return value?.replace(/\s+/g, '').toUpperCase() ?? '';
  }
}
