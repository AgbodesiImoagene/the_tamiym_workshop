import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  CurrencyCode,
  ShippingRateProvider,
  ShippingRuleMatchType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';

type ShippingZoneInput = {
  name?: string;
  isActive?: boolean;
};

type ShippingRuleInput = {
  countryCode?: string;
  matchType?: ShippingRuleMatchType;
  matchValue?: string;
  matchContext?: string | null;
  priority?: number;
  isActive?: boolean;
};

type ShippingRateInput = {
  provider?: ShippingRateProvider;
  serviceLevel?: string;
  currency?: CurrencyCode;
  flatFee?: number;
  priority?: number;
  isActive?: boolean;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  minDeliveryDays?: number | null;
  maxDeliveryDays?: number | null;
};

@Injectable()
export class ShippingAdminService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * TTW-199: deactivated states stay in the admin list (the rows carry
   * `isActive`) so an admin can see them. The customer list (`GeoService`)
   * stays active-only.
   */
  async listStates() {
    return this.prisma.geoState.findMany({
      orderBy: { name: 'asc' },
    });
  }

  async listLgas(code: string) {
    const state = await this.prisma.geoState.findUnique({
      where: { code },
      select: { code: true },
    });
    if (!state) {
      return [];
    }
    return this.prisma.geoLga.findMany({
      where: { stateCode: code },
      orderBy: { name: 'asc' },
    });
  }

  async listZones() {
    return this.prisma.shippingZone.findMany({
      orderBy: { name: 'asc' },
      include: {
        areas: { include: { state: true, lga: true } },
        rules: { orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] },
        rates: { orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }] },
      },
    });
  }

  async createZone(
    dto: Required<Pick<ShippingZoneInput, 'name'>> & ShippingZoneInput,
  ) {
    return this.prisma.shippingZone.create({
      data: {
        name: dto.name,
        isActive: dto.isActive ?? true,
      },
    });
  }

  async getZone(id: string) {
    const zone = await this.prisma.shippingZone.findUnique({
      where: { id },
      include: {
        areas: { include: { state: true, lga: true } },
        rules: { orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] },
        rates: { orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }] },
      },
    });
    if (!zone) {
      throw new NotFoundException('Shipping zone not found');
    }
    return zone;
  }

  async updateZone(id: string, dto: ShippingZoneInput) {
    await this.assertZoneExists(id);
    return this.prisma.shippingZone.update({
      where: { id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      },
      include: {
        areas: { include: { state: true, lga: true } },
        rules: { orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] },
        rates: { orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }] },
      },
    });
  }

  async deleteZone(id: string) {
    await this.assertZoneExists(id);
    await this.prisma.shippingZone.delete({ where: { id } });
  }

  async listAreas(zoneId: string) {
    await this.assertZoneExists(zoneId);
    return this.prisma.shippingZoneArea.findMany({
      where: { zoneId },
      include: { state: true, lga: true },
      orderBy: [{ stateCode: 'asc' }, { lgaId: 'asc' }],
    });
  }

  async createArea(
    zoneId: string,
    dto: { stateCode: string; lgaId?: string | null },
  ) {
    await this.assertZoneExists(zoneId);
    const state = await this.prisma.geoState.findUnique({
      where: { code: dto.stateCode },
    });
    if (!state) {
      throw new BadRequestException(`State ${dto.stateCode} not found`);
    }
    this.assertStateActive(state);

    let lgaId: string | null = null;
    if (dto.lgaId) {
      const lga = await this.prisma.geoLga.findFirst({
        where: { id: dto.lgaId, stateCode: dto.stateCode },
      });
      if (!lga) {
        throw new BadRequestException(
          'LGA not found or does not belong to state',
        );
      }
      lgaId = lga.id;
    }

    return this.prisma.$transaction(async (tx) => {
      const area = await tx.shippingZoneArea.create({
        data: {
          zoneId,
          stateCode: state.code,
          lgaId,
        },
        include: { state: true, lga: true },
      });

      const matchType = lgaId
        ? ShippingRuleMatchType.ADMIN2
        : ShippingRuleMatchType.ADMIN1;
      const matchValue = lgaId ?? state.code;
      const matchContext = lgaId ? state.code : null;
      const existingRule = await tx.shippingZoneRule.findFirst({
        where: {
          zoneId,
          countryCode: 'NG',
          matchType,
          matchValue,
          ...(matchContext ? { matchContext } : {}),
        },
      });

      if (existingRule) {
        await tx.shippingZoneRule.update({
          where: { id: existingRule.id },
          data: { isActive: true },
        });
      } else {
        await tx.shippingZoneRule.create({
          data: {
            zoneId,
            countryCode: 'NG',
            matchType,
            matchValue,
            ...(matchContext ? { matchContext } : {}),
            priority: lgaId ? 100 : 200,
            isActive: true,
            metadata: { source: 'legacy-area-endpoint' },
          },
        });
      }

      return area;
    });
  }

  async listRules(zoneId: string) {
    await this.assertZoneExists(zoneId);
    return this.prisma.shippingZoneRule.findMany({
      where: { zoneId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async createRule(zoneId: string, dto: ShippingRuleInput) {
    await this.assertZoneExists(zoneId);
    const normalized = await this.normalizeRuleInput(dto);
    return this.prisma.shippingZoneRule.create({
      data: {
        zoneId,
        ...normalized,
      },
    });
  }

  async updateRule(id: string, dto: ShippingRuleInput) {
    const existing = await this.prisma.shippingZoneRule.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Shipping rule not found');
    }
    const normalized = await this.normalizeRuleInput(
      {
        countryCode: dto.countryCode ?? existing.countryCode,
        matchType: dto.matchType ?? existing.matchType,
        matchValue: dto.matchValue ?? existing.matchValue,
        matchContext:
          dto.matchContext !== undefined
            ? dto.matchContext
            : existing.matchContext,
        priority: dto.priority ?? existing.priority,
        isActive: dto.isActive ?? existing.isActive,
      },
      existing,
    );
    return this.prisma.shippingZoneRule.update({
      where: { id },
      data: normalized,
    });
  }

  async deleteRule(id: string) {
    const existing = await this.prisma.shippingZoneRule.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Shipping rule not found');
    }
    await this.prisma.shippingZoneRule.delete({ where: { id } });
  }

  async listRates(zoneId: string) {
    await this.assertZoneExists(zoneId);
    return this.prisma.shippingRate.findMany({
      where: { zoneId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async createRate(zoneId: string, dto: ShippingRateInput) {
    await this.assertZoneExists(zoneId);
    return this.prisma.shippingRate.create({
      data: this.normalizeRateInput(zoneId, dto, true),
    });
  }

  async updateRate(id: string, dto: ShippingRateInput) {
    const existing = await this.prisma.shippingRate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Shipping rate not found');
    }
    return this.prisma.shippingRate.update({
      where: { id },
      data: this.normalizeRateInput(existing.zoneId, {
        provider: dto.provider ?? existing.provider,
        serviceLevel: dto.serviceLevel ?? existing.serviceLevel,
        currency: dto.currency ?? existing.currency,
        flatFee:
          dto.flatFee !== undefined ? dto.flatFee : Number(existing.flatFee),
        priority: dto.priority ?? existing.priority,
        isActive: dto.isActive ?? existing.isActive,
        effectiveFrom:
          dto.effectiveFrom !== undefined
            ? dto.effectiveFrom
            : (existing.effectiveFrom?.toISOString() ?? null),
        effectiveTo:
          dto.effectiveTo !== undefined
            ? dto.effectiveTo
            : (existing.effectiveTo?.toISOString() ?? null),
        minDeliveryDays:
          dto.minDeliveryDays !== undefined
            ? dto.minDeliveryDays
            : existing.minDeliveryDays,
        maxDeliveryDays:
          dto.maxDeliveryDays !== undefined
            ? dto.maxDeliveryDays
            : existing.maxDeliveryDays,
      }),
    });
  }

  async deleteRate(id: string) {
    const existing = await this.prisma.shippingRate.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Shipping rate not found');
    }
    await this.prisma.shippingRate.delete({ where: { id } });
  }

  /**
   * `existing` is the rule being edited, if any. A rule keeps its deactivated
   * state (TTW-200): only a rule that newly names one is refused.
   */
  private async normalizeRuleInput(
    dto: ShippingRuleInput,
    existing?: {
      countryCode: string;
      matchType: ShippingRuleMatchType;
      matchValue: string;
      matchContext: string | null;
    },
  ) {
    const countryCode = dto.countryCode?.trim().toUpperCase();
    const matchType = dto.matchType;
    const matchValue = dto.matchValue?.trim();
    const priority = dto.priority ?? 100;
    const isActive = dto.isActive ?? true;

    if (!countryCode || !matchType || !matchValue) {
      throw new BadRequestException(
        'countryCode, matchType, and matchValue are required',
      );
    }

    if (priority < 0) {
      throw new BadRequestException('priority must be zero or greater');
    }

    let normalizedMatchValue = matchValue;
    let normalizedMatchContext = dto.matchContext?.trim() ?? null;

    if (countryCode === 'NG' && matchType === ShippingRuleMatchType.ADMIN1) {
      const state = await this.prisma.geoState.findFirst({
        where: {
          OR: [
            { code: matchValue.toUpperCase() },
            { name: { equals: matchValue, mode: 'insensitive' } },
          ],
        },
      });
      if (!state) {
        throw new BadRequestException(`State ${matchValue} not found`);
      }
      if (
        !(
          existing?.countryCode === countryCode &&
          existing.matchType === matchType &&
          existing.matchValue === state.code
        )
      ) {
        this.assertStateActive(state);
      }
      normalizedMatchValue = state.code;
      normalizedMatchContext = null;
    }

    if (countryCode === 'NG' && matchType === ShippingRuleMatchType.ADMIN2) {
      const context = normalizedMatchContext?.toUpperCase();
      if (!context) {
        throw new BadRequestException(
          'Nigeria ADMIN2 rules require matchContext with the parent state code',
        );
      }
      const state = await this.prisma.geoState.findUnique({
        where: { code: context },
      });
      if (!state) {
        throw new BadRequestException(`State ${context} not found`);
      }
      const lga = await this.prisma.geoLga.findFirst({
        where: {
          stateCode: state.code,
          OR: [
            { id: matchValue },
            { name: { equals: matchValue, mode: 'insensitive' } },
          ],
        },
      });
      if (!lga) {
        throw new BadRequestException(
          `LGA ${matchValue} not found for state ${state.code}`,
        );
      }
      if (
        !(
          existing?.countryCode === countryCode &&
          existing.matchType === matchType &&
          existing.matchValue === lga.id &&
          existing.matchContext === state.code
        )
      ) {
        this.assertStateActive(state);
      }
      normalizedMatchValue = lga.id;
      normalizedMatchContext = state.code;
    }

    return {
      countryCode,
      matchType,
      matchValue: normalizedMatchValue,
      matchContext: normalizedMatchContext,
      priority,
      isActive,
    };
  }

  private normalizeRateInput(
    zoneId: string,
    dto: ShippingRateInput,
    requireFlatFee = false,
  ) {
    if (requireFlatFee && dto.flatFee === undefined) {
      throw new BadRequestException('flatFee is required');
    }
    const priority = dto.priority ?? 100;
    if (priority < 0) {
      throw new BadRequestException('priority must be zero or greater');
    }
    const effectiveFrom = dto.effectiveFrom
      ? new Date(dto.effectiveFrom)
      : null;
    const effectiveTo = dto.effectiveTo ? new Date(dto.effectiveTo) : null;
    if (effectiveFrom && !isFinite(effectiveFrom.getTime())) {
      throw new BadRequestException('effectiveFrom is not a valid date');
    }
    if (effectiveTo && !isFinite(effectiveTo.getTime())) {
      throw new BadRequestException('effectiveTo is not a valid date');
    }
    return {
      zoneId,
      provider: dto.provider ?? ShippingRateProvider.INTERNAL,
      serviceLevel: dto.serviceLevel?.trim() || 'STANDARD',
      currency: dto.currency ?? CurrencyCode.NGN,
      flatFee: dto.flatFee ?? 0,
      priority,
      isActive: dto.isActive ?? true,
      effectiveFrom,
      effectiveTo,
      minDeliveryDays: dto.minDeliveryDays ?? null,
      maxDeliveryDays: dto.maxDeliveryDays ?? null,
    };
  }

  // No address can name a deactivated state (TTW-194), so a new rule or area
  // for it could never match.
  private assertStateActive(state: { code: string; isActive: boolean }) {
    if (!state.isActive) {
      throw new BadRequestException(`State ${state.code} is deactivated`);
    }
  }

  private async assertZoneExists(zoneId: string) {
    const zone = await this.prisma.shippingZone.findUnique({
      where: { id: zoneId },
      select: { id: true },
    });
    if (!zone) {
      throw new NotFoundException('Shipping zone not found');
    }
  }
}
