import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import type { AuditLogInput } from '../audit/audit.types';
import type { Prisma } from '../generated/prisma/client';
import {
  AuditAction,
  CurrencyCode,
  ShippingRateBracketBasis,
  ShippingRateProvider,
  ShippingRuleMatchType,
} from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import { canonicalCountryCode } from './country-code';

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
  /** TTW-098: what the brackets measure; `null` clears them (flat fee only). */
  bracketBasis?: ShippingRateBracketBasis | null;
  /** TTW-098: sent = the full new list; left out = brackets untouched. */
  brackets?: Array<{ minValue: number; fee: number }>;
};

const RATE_BRACKETS_INCLUDE = {
  brackets: { orderBy: { minValue: 'asc' as const } },
};

type BracketWrite = {
  bracketBasis?: ShippingRateBracketBasis | null;
  brackets?: {
    deleteMany?: Record<string, never>;
    create?: Array<{ minValue: number; fee: number }>;
  };
};

/**
 * TTW-097: a correction that would leave a state with no delivery is refused
 * (409 `SHIPPING_COVERAGE_WOULD_BE_LOST`) unless the admin acknowledged it.
 */
export type CoverageOptions = { acknowledgeCoverageLoss?: boolean };

/** Internal: `unaffected` marks a change that cannot alter coverage (no lock, no scan). */
type GuardOptions = CoverageOptions & { unaffected?: boolean };

export const SHIPPING_COVERAGE_WOULD_BE_LOST =
  'SHIPPING_COVERAGE_WOULD_BE_LOST';

@Injectable()
export class ShippingAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

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
        rates: {
          orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
          include: RATE_BRACKETS_INCLUDE,
        },
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
        rates: {
          orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
          include: RATE_BRACKETS_INCLUDE,
        },
      },
    });
    if (!zone) {
      throw new NotFoundException('Shipping zone not found');
    }
    return zone;
  }

  async updateZone(
    id: string,
    dto: ShippingZoneInput,
    opts: CoverageOptions = {},
  ) {
    const existing = await this.prisma.shippingZone.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Shipping zone not found');
    }
    return this.withCoverageGuard(
      this.guardFor(opts, dto.isActive !== undefined),
      async (tx) => {
        const updated = await tx.shippingZone.update({
          where: { id },
          data: {
            ...(dto.name !== undefined ? { name: dto.name } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
          include: {
            areas: { include: { state: true, lga: true } },
            rules: { orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }] },
            rates: {
              orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
              include: RATE_BRACKETS_INCLUDE,
            },
          },
        });
        return {
          result: updated,
          audit: {
            eventName: 'shipping.zone.updated',
            action: AuditAction.UPDATE,
            entityType: 'ShippingZone',
            entityId: id,
            before: { name: existing.name, isActive: existing.isActive },
            after: { name: updated.name, isActive: updated.isActive },
          },
        };
      },
    );
  }

  async deleteZone(id: string, opts: CoverageOptions = {}) {
    const existing = await this.prisma.shippingZone.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Shipping zone not found');
    }
    await this.withCoverageGuard(opts, async (tx) => {
      await tx.shippingZone.delete({ where: { id } });
      return {
        result: undefined,
        audit: {
          eventName: 'shipping.zone.deleted',
          action: AuditAction.DELETE,
          entityType: 'ShippingZone',
          entityId: id,
          before: { name: existing.name, isActive: existing.isActive },
        },
      };
    });
  }

  async deleteArea(zoneId: string, areaId: string, opts: CoverageOptions = {}) {
    const area = await this.prisma.shippingZoneArea.findFirst({
      where: { id: areaId, zoneId },
    });
    if (!area) {
      throw new NotFoundException('Shipping area not found in this zone');
    }
    await this.withCoverageGuard(opts, async (tx) => {
      await tx.shippingZoneArea.delete({ where: { id: areaId } });
      // `createArea` mirrors every area as a rule: remove that rule too, or the
      // state would keep matching this zone.
      await tx.shippingZoneRule.deleteMany({
        where: area.lgaId
          ? {
              zoneId,
              countryCode: 'NG',
              matchType: ShippingRuleMatchType.ADMIN2,
              matchValue: area.lgaId,
              matchContext: area.stateCode,
            }
          : {
              zoneId,
              countryCode: 'NG',
              matchType: ShippingRuleMatchType.ADMIN1,
              matchValue: area.stateCode,
            },
      });
      return {
        result: undefined,
        audit: {
          eventName: 'shipping.area.deleted',
          action: AuditAction.DELETE,
          entityType: 'ShippingZoneArea',
          entityId: areaId,
          targetType: 'ShippingZone',
          targetId: zoneId,
          before: { stateCode: area.stateCode, lgaId: area.lgaId },
        },
      };
    });
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
      this.assertLgaActive(lga);
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

  async updateRule(
    id: string,
    dto: ShippingRuleInput,
    opts: CoverageOptions = {},
  ) {
    return this.withCoverageGuard(opts, async (tx) => {
      // Read after the lock: another admin may have changed the row while this
      // request waited, and we must not write that stale copy back.
      const existing = await tx.shippingZoneRule.findUnique({ where: { id } });
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
      const updated = await tx.shippingZoneRule.update({
        where: { id },
        data: normalized,
      });
      return {
        result: updated,
        audit: {
          eventName: 'shipping.rule.updated',
          action: AuditAction.UPDATE,
          entityType: 'ShippingZoneRule',
          entityId: id,
          targetType: 'ShippingZone',
          targetId: existing.zoneId,
          before: this.ruleSnapshot(existing),
          after: this.ruleSnapshot(updated),
        },
      };
    });
  }

  async deleteRule(id: string, opts: CoverageOptions = {}) {
    const existing = await this.prisma.shippingZoneRule.findUnique({
      where: { id },
    });
    if (!existing) {
      throw new NotFoundException('Shipping rule not found');
    }
    await this.withCoverageGuard(opts, async (tx) => {
      await tx.shippingZoneRule.delete({ where: { id } });
      return {
        result: undefined,
        audit: {
          eventName: 'shipping.rule.deleted',
          action: AuditAction.DELETE,
          entityType: 'ShippingZoneRule',
          entityId: id,
          targetType: 'ShippingZone',
          targetId: existing.zoneId,
          before: this.ruleSnapshot(existing),
        },
      };
    });
  }

  async listRates(zoneId: string) {
    await this.assertZoneExists(zoneId);
    return this.prisma.shippingRate.findMany({
      where: { zoneId },
      orderBy: [{ priority: 'asc' }, { createdAt: 'desc' }],
      include: RATE_BRACKETS_INCLUDE,
    });
  }

  async createRate(zoneId: string, dto: ShippingRateInput) {
    await this.assertZoneExists(zoneId);
    return this.prisma.shippingRate.create({
      data: {
        ...this.normalizeRateInput(zoneId, dto, true),
        ...this.normalizeBrackets(dto, 'create', null),
      },
      include: RATE_BRACKETS_INCLUDE,
    });
  }

  async updateRate(
    id: string,
    dto: ShippingRateInput,
    opts: CoverageOptions = {},
  ) {
    return this.withCoverageGuard(
      this.guardFor(
        opts,
        dto.isActive !== undefined ||
          dto.effectiveFrom !== undefined ||
          dto.effectiveTo !== undefined ||
          dto.serviceLevel !== undefined ||
          dto.provider !== undefined ||
          dto.currency !== undefined,
      ),
      async (tx) => {
        // Read after the lock: see `updateRule`.
        const existing = await tx.shippingRate.findUnique({
          where: { id },
          include: RATE_BRACKETS_INCLUDE,
        });
        if (!existing) {
          throw new NotFoundException('Shipping rate not found');
        }
        const brackets = this.normalizeBrackets(
          dto,
          'update',
          existing.bracketBasis,
        );
        const data = this.normalizeRateInput(existing.zoneId, {
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
        });
        const updated = await tx.shippingRate.update({
          where: { id },
          data: { ...data, ...brackets },
          include: RATE_BRACKETS_INCLUDE,
        });
        return {
          result: updated,
          audit: {
            eventName: 'shipping.rate.updated',
            action: AuditAction.UPDATE,
            entityType: 'ShippingRate',
            entityId: id,
            targetType: 'ShippingZone',
            targetId: existing.zoneId,
            before: this.rateSnapshot(existing),
            after: this.rateSnapshot(updated),
          },
        };
      },
    );
  }

  async deleteRate(id: string, opts: CoverageOptions = {}) {
    const existing = await this.prisma.shippingRate.findUnique({
      where: { id },
      include: RATE_BRACKETS_INCLUDE,
    });
    if (!existing) {
      throw new NotFoundException('Shipping rate not found');
    }
    await this.withCoverageGuard(opts, async (tx) => {
      await tx.shippingRate.delete({ where: { id } });
      return {
        result: undefined,
        audit: {
          eventName: 'shipping.rate.deleted',
          action: AuditAction.DELETE,
          entityType: 'ShippingRate',
          entityId: id,
          targetType: 'ShippingZone',
          targetId: existing.zoneId,
          before: this.rateSnapshot(existing),
        },
      };
    });
  }

  private ruleSnapshot(rule: {
    countryCode: string;
    matchType: ShippingRuleMatchType;
    matchValue: string;
    matchContext: string | null;
    priority: number;
    isActive: boolean;
  }) {
    return {
      countryCode: rule.countryCode,
      matchType: rule.matchType,
      matchValue: rule.matchValue,
      matchContext: rule.matchContext,
      priority: rule.priority,
      isActive: rule.isActive,
    };
  }

  private rateSnapshot(rate: {
    provider: ShippingRateProvider;
    serviceLevel: string;
    currency: CurrencyCode;
    flatFee: { toString(): string } | number;
    priority: number;
    isActive: boolean;
    effectiveFrom: Date | null;
    effectiveTo: Date | null;
    minDeliveryDays: number | null;
    maxDeliveryDays: number | null;
    bracketBasis?: ShippingRateBracketBasis | null;
    brackets?: Array<{
      minValue: number;
      fee: { toString(): string } | number;
    }>;
  }) {
    return {
      bracketBasis: rate.bracketBasis ?? null,
      brackets: (rate.brackets ?? []).map((b) => ({
        minValue: b.minValue,
        fee: Number(b.fee),
      })),
      provider: rate.provider,
      serviceLevel: rate.serviceLevel,
      currency: rate.currency,
      flatFee: Number(rate.flatFee),
      priority: rate.priority,
      isActive: rate.isActive,
      effectiveFrom: rate.effectiveFrom,
      effectiveTo: rate.effectiveTo,
      minDeliveryDays: rate.minDeliveryDays,
      maxDeliveryDays: rate.maxDeliveryDays,
    };
  }

  /**
   * Runs `change` in a transaction and, unless the admin acknowledged it, rolls
   * back with a 409 when it leaves a state that had delivery with none. A state
   * is covered when an active zone has an active ADMIN1/ADMIN2 rule for it and
   * at least one active rate (a zone without a rate is refused, TTW-086).
   */
  private async withCoverageGuard<T>(
    opts: GuardOptions,
    change: (
      tx: Prisma.TransactionClient,
    ) => Promise<{ result: T; audit: AuditLogInput }>,
  ): Promise<T> {
    const { result, audit } = await this.runGuarded(opts, change);
    // Written after the commit: `AuditService.log` swallows its own errors, and
    // a failed insert inside the transaction would abort it.
    await this.audit.log(audit);
    return result;
  }

  private async runGuarded<T>(
    opts: GuardOptions,
    change: (
      tx: Prisma.TransactionClient,
    ) => Promise<{ result: T; audit: AuditLogInput }>,
  ) {
    const scans = !opts.acknowledgeCoverageLoss && !opts.unaffected;
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          if (!opts.unaffected) {
            // Serialise every change that can alter coverage, confirmed or not:
            // two admins removing the last two rates of a state at once would
            // each see the other one still covering it.
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('shipping-coverage-guard'))`;
          }
          const now = new Date();
          const before = scans ? await this.coveredStateCodes(tx, now) : null;
          const outcome = await change(tx);
          if (before) {
            const after = await this.coveredStateCodes(tx, now);
            const lost = [...before].filter((code) => !after.has(code)).sort();
            if (lost.length > 0) {
              const states = await tx.geoState.findMany({
                where: { code: { in: lost } },
                select: { code: true, name: true },
                orderBy: { code: 'asc' },
              });
              throw new ConflictException({
                code: SHIPPING_COVERAGE_WOULD_BE_LOST,
                message:
                  'This change would leave these states without delivery. Confirm to continue.',
                uncoveredStates: states,
              });
            }
          }
          return outcome;
        },
        // Explicit, because a request may wait on the coverage lock behind
        // another admin: Prisma's defaults (2 s wait, 5 s run) are too tight.
        { maxWait: 5_000, timeout: 15_000 },
      );
    } catch (error) {
      // Another admin deleted the row between our read and our write.
      if ((error as { code?: string } | null)?.code === 'P2025') {
        throw new NotFoundException('Shipping record not found');
      }
      throw error;
    }
  }

  /** Only a change to these fields can alter which states have delivery. */
  private guardFor(
    opts: CoverageOptions,
    affectsCoverage: boolean,
  ): GuardOptions {
    return affectsCoverage ? opts : { unaffected: true };
  }

  private async coveredStateCodes(
    tx: Prisma.TransactionClient,
    now: Date,
  ): Promise<Set<string>> {
    // Same rate window as `InternalZoneRateProvider`: a rate outside its
    // effective dates does not quote, so it does not cover a state.
    const zones = await tx.shippingZone.findMany({
      where: {
        isActive: true,
        rates: {
          some: {
            isActive: true,
            // The only rate `quote` ever asks for (default service level, NGN).
            provider: ShippingRateProvider.INTERNAL,
            currency: CurrencyCode.NGN,
            serviceLevel: 'STANDARD',
            OR: [{ effectiveFrom: null }, { effectiveFrom: { lte: now } }],
            AND: [
              { OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }] },
            ],
          },
        },
      },
      select: {
        rules: {
          where: {
            isActive: true,
            countryCode: 'NG',
            matchType: {
              in: [ShippingRuleMatchType.ADMIN1, ShippingRuleMatchType.ADMIN2],
            },
          },
          select: { matchType: true, matchValue: true, matchContext: true },
        },
      },
    });
    const codes = new Set<string>();
    for (const zone of zones) {
      for (const rule of zone.rules) {
        const code =
          rule.matchType === ShippingRuleMatchType.ADMIN2
            ? rule.matchContext
            : rule.matchValue;
        if (code) codes.add(code);
      }
    }
    return codes;
  }

  /**
   * TTW-226: the code is read with the rule addresses use (`canonicalCountryCode`),
   * so a full-width or look-alike code cannot be stored and never match. A code
   * that is not a real one is refused. A rule saved earlier keeps working: an
   * unchanged stored value that is not canonical is kept as it is.
   */
  /** A stored full-width code and its folded form are the same country. */
  private sameCountry(stored: string, code: string) {
    return (canonicalCountryCode(stored) ?? stored) === code;
  }

  private resolveRuleCountryCode(
    dto: ShippingRuleInput,
    existing?: { countryCode: string },
  ): string | undefined {
    if (dto.countryCode === undefined || dto.countryCode === null) {
      return undefined;
    }
    const code = canonicalCountryCode(dto.countryCode);
    if (code) {
      return code;
    }
    if (existing && dto.countryCode === existing.countryCode) {
      return existing.countryCode;
    }
    throw new BadRequestException(
      'countryCode must be a valid ISO 3166-1 alpha-2 code',
    );
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
    const countryCode = this.resolveRuleCountryCode(dto, existing);
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
          existing &&
          this.sameCountry(existing.countryCode, countryCode) &&
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
          existing &&
          this.sameCountry(existing.countryCode, countryCode) &&
          existing.matchType === matchType &&
          existing.matchValue === lga.id &&
          existing.matchContext === state.code
        )
      ) {
        this.assertStateActive(state);
        this.assertLgaActive(lga);
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

  /**
   * TTW-098: what to write for a rate's brackets. Nothing is returned when an
   * update does not mention them. A basis of `null` clears them. The list sent
   * replaces the old one. Every minimum is a whole number of at least 1 (0 is
   * the flat fee) and no two brackets share one.
   */
  private normalizeBrackets(
    dto: ShippingRateInput,
    mode: 'create' | 'update',
    currentBasis: ShippingRateBracketBasis | null,
  ): BracketWrite {
    const replace = mode === 'update' ? { deleteMany: {} } : {};
    if (dto.bracketBasis === undefined && dto.brackets === undefined) {
      return mode === 'create' ? { bracketBasis: null } : {};
    }
    const basis =
      dto.bracketBasis === undefined ? currentBasis : dto.bracketBasis;
    if (basis === null) {
      if (dto.brackets && dto.brackets.length > 0) {
        throw new BadRequestException(
          'bracketBasis is required when brackets are sent',
        );
      }
      return {
        bracketBasis: null,
        ...(mode === 'update' ? { brackets: { deleteMany: {} } } : {}),
      };
    }
    if (dto.brackets === undefined) {
      if (basis !== currentBasis) {
        throw new BadRequestException(
          'Send the brackets again when you change the bracket basis: the old minimums are in another unit',
        );
      }
      return { bracketBasis: basis };
    }
    if (dto.brackets.length === 0) {
      throw new BadRequestException(
        'Add at least one bracket, or clear the bracket basis',
      );
    }
    const seen = new Set<number>();
    for (const bracket of dto.brackets) {
      if (!Number.isInteger(bracket.minValue) || bracket.minValue < 1) {
        throw new BadRequestException(
          'Each bracket minimum must be a whole number of 1 or more',
        );
      }
      if (!Number.isFinite(bracket.fee) || bracket.fee < 0) {
        throw new BadRequestException(
          'Each bracket fee must be zero or greater',
        );
      }
      if (seen.has(bracket.minValue)) {
        throw new BadRequestException(
          'Two brackets cannot have the same minimum',
        );
      }
      seen.add(bracket.minValue);
    }
    const create = [...dto.brackets]
      .sort((a, b) => a.minValue - b.minValue)
      .map((b) => ({ minValue: b.minValue, fee: b.fee }));
    return { bracketBasis: basis, brackets: { ...replace, create } };
  }

  // No address can name a deactivated state (TTW-194), so a new rule or area
  // for it could never match.
  private assertStateActive(state: { code: string; isActive: boolean }) {
    if (!state.isActive) {
      throw new BadRequestException(`State ${state.code} is deactivated`);
    }
  }

  // Customers are only offered active LGAs, so a new rule or area for a
  // deactivated one could never match (TTW-202).
  private assertLgaActive(lga: { name: string; isActive: boolean }) {
    if (!lga.isActive) {
      throw new BadRequestException(`LGA ${lga.name} is deactivated`);
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
