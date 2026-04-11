import { Injectable } from '@nestjs/common';
import { AddressProvider } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';

type AddressNormalizationInput = {
  addressLine1?: string;
  addressLine2?: string | null;
  recipientName?: string | null;
  phone?: string | null;
  city?: string;
  state?: string;
  postalCode?: string | null;
  country?: string | null;
  countryCode?: string | null;
  landmark?: string | null;
  instructions?: string | null;
  locality?: string | null;
  dependentLocality?: string | null;
  administrativeAreaLevel1?: string | null;
  administrativeAreaLevel2?: string | null;
  stateCode?: string | null;
  lgaId?: string | null;
  provider?: AddressProvider;
  googlePlaceId?: string | null;
  formattedAddress?: string | null;
  latitude?: unknown;
  longitude?: unknown;
};

type ExistingAddressShape = Required<
  Pick<
    AddressNormalizationInput,
    'addressLine1' | 'city' | 'state' | 'country' | 'countryCode' | 'provider'
  >
> &
  Partial<AddressNormalizationInput> & {
    latitude?: unknown;
    longitude?: unknown;
  };

type NormalizedAddressPayload = {
  addressLine1?: string;
  addressLine2?: string | null;
  recipientName?: string | null;
  phone?: string | null;
  city?: string;
  state?: string;
  postalCode?: string | null;
  country?: string;
  countryCode?: string;
  landmark?: string | null;
  instructions?: string | null;
  locality?: string | null;
  dependentLocality?: string | null;
  administrativeAreaLevel1?: string | null;
  administrativeAreaLevel2?: string | null;
  stateCode?: string | null;
  lgaId?: string | null;
  provider?: AddressProvider;
  googlePlaceId?: string | null;
  formattedAddress?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  normalizationMetadata?: Prisma.InputJsonValue;
};

@Injectable()
export class AddressNormalizationService {
  constructor(private readonly prisma: PrismaService) {}

  async normalizeForCreate(
    input: AddressNormalizationInput,
  ): Promise<NormalizedAddressPayload> {
    return this.normalize(input, null);
  }

  async normalizeForUpdate(
    existing: ExistingAddressShape,
    input: AddressNormalizationInput,
  ): Promise<NormalizedAddressPayload> {
    return this.normalize(input, existing);
  }

  private async normalize(
    input: AddressNormalizationInput,
    existing: ExistingAddressShape | null,
  ): Promise<NormalizedAddressPayload> {
    const countryCode = this.resolveCountryCode(input, existing);
    const country = this.resolveCountryName(input, existing, countryCode);
    const locality = this.firstDefined(
      this.clean(input.locality),
      this.clean(input.city),
      existing?.locality ?? null,
      existing?.city ?? null,
    );
    const admin1Input = this.firstDefined(
      this.clean(input.administrativeAreaLevel1),
      this.clean(input.state),
      existing?.administrativeAreaLevel1 ?? null,
      existing?.state ?? null,
    );
    const admin2Input = this.firstDefined(
      this.clean(input.administrativeAreaLevel2),
      existing?.administrativeAreaLevel2 ?? null,
    );

    const resolvedState = await this.resolveState(
      countryCode,
      input,
      admin1Input,
    );
    const resolvedLga = await this.resolveLga(
      countryCode,
      input,
      resolvedState?.code ?? existing?.stateCode ?? null,
      admin2Input,
    );

    const stateCode = resolvedState?.code ?? existing?.stateCode ?? null;
    const lgaId = resolvedLga?.id ?? existing?.lgaId ?? null;
    const administrativeAreaLevel1 = resolvedState?.name ?? admin1Input ?? null;
    const administrativeAreaLevel2 = resolvedLga?.name ?? admin2Input ?? null;
    const city = this.firstDefined(
      this.clean(input.city),
      locality,
      existing?.city ?? null,
    );
    const state = this.firstDefined(
      this.clean(input.state),
      administrativeAreaLevel1,
      existing?.state ?? null,
    );
    const provider =
      input.provider ??
      (input.googlePlaceId ? AddressProvider.GOOGLE_PLACES : undefined) ??
      existing?.provider ??
      AddressProvider.MANUAL;

    return {
      addressLine1:
        this.firstDefined(
          this.clean(input.addressLine1),
          existing?.addressLine1 ?? null,
        ) ?? undefined,
      addressLine2: this.cleanNullable(
        input.addressLine2,
        existing?.addressLine2,
      ),
      recipientName: this.cleanNullable(
        input.recipientName,
        existing?.recipientName,
      ),
      phone: this.cleanNullable(input.phone, existing?.phone),
      city: city ?? undefined,
      state: state ?? undefined,
      postalCode: this.cleanNullable(input.postalCode, existing?.postalCode),
      country,
      countryCode,
      landmark: this.cleanNullable(input.landmark, existing?.landmark),
      instructions: this.cleanNullable(
        input.instructions,
        existing?.instructions,
      ),
      locality,
      dependentLocality: this.cleanNullable(
        input.dependentLocality,
        existing?.dependentLocality,
      ),
      administrativeAreaLevel1,
      administrativeAreaLevel2,
      stateCode,
      lgaId,
      provider,
      googlePlaceId: this.cleanNullable(
        input.googlePlaceId,
        existing?.googlePlaceId,
      ),
      formattedAddress: this.cleanNullable(
        input.formattedAddress,
        existing?.formattedAddress,
      ),
      latitude:
        input.latitude !== undefined
          ? this.normalizeNumber(input.latitude)
          : existing?.latitude !== undefined
            ? this.normalizeNumber(existing.latitude)
            : null,
      longitude:
        input.longitude !== undefined
          ? this.normalizeNumber(input.longitude)
          : existing?.longitude !== undefined
            ? this.normalizeNumber(existing.longitude)
            : null,
      normalizationMetadata: {
        version: 1,
        normalizedAt: new Date().toISOString(),
        countryCode,
        resolvedStateCode: stateCode,
        resolvedLgaId: lgaId,
        provider,
      } as Prisma.InputJsonValue,
    };
  }

  private resolveCountryCode(
    input: AddressNormalizationInput,
    existing: ExistingAddressShape | null,
  ) {
    const raw = this.clean(input.countryCode);
    if (raw) {
      return raw.toUpperCase();
    }
    const country = this.firstDefined(
      this.clean(input.country),
      existing?.country ?? null,
    );
    if (country?.toLowerCase() === 'nigeria') {
      return 'NG';
    }
    return existing?.countryCode ?? 'NG';
  }

  private resolveCountryName(
    input: AddressNormalizationInput,
    existing: ExistingAddressShape | null,
    countryCode: string,
  ) {
    return (
      this.firstDefined(this.clean(input.country), existing?.country ?? null) ??
      (countryCode === 'NG' ? 'Nigeria' : countryCode)
    );
  }

  private async resolveState(
    countryCode: string,
    input: AddressNormalizationInput,
    admin1: string | null,
  ) {
    if (countryCode !== 'NG') {
      return null;
    }
    const explicitCode = this.clean(input.stateCode)?.toUpperCase();
    if (explicitCode) {
      return this.prisma.geoState.findUnique({ where: { code: explicitCode } });
    }
    if (!admin1) {
      return null;
    }
    const codeCandidate = admin1.toUpperCase();
    return this.prisma.geoState.findFirst({
      where: {
        OR: [
          { code: codeCandidate },
          { name: { equals: admin1, mode: 'insensitive' } },
        ],
      },
    });
  }

  private async resolveLga(
    countryCode: string,
    input: AddressNormalizationInput,
    stateCode: string | null,
    admin2: string | null,
  ) {
    if (countryCode !== 'NG') {
      return null;
    }
    if (input.lgaId) {
      return this.prisma.geoLga.findFirst({
        where: {
          id: input.lgaId,
          ...(stateCode ? { stateCode } : {}),
        },
      });
    }
    if (!admin2 || !stateCode) {
      return null;
    }
    return this.prisma.geoLga.findFirst({
      where: {
        stateCode,
        name: { equals: admin2, mode: 'insensitive' },
      },
    });
  }

  private clean(value: string | undefined | null) {
    if (value === undefined || value === null) {
      return null;
    }
    const trimmed = value.trim();
    return trimmed.length ? trimmed : null;
  }

  private cleanNullable(
    value: string | undefined | null,
    fallback?: string | null,
  ) {
    const cleaned = this.clean(value);
    if (value !== undefined) {
      return cleaned;
    }
    return fallback ?? null;
  }

  private firstDefined<T>(...values: Array<T | null | undefined>) {
    for (const value of values) {
      if (value !== undefined && value !== null) {
        return value;
      }
    }
    return null;
  }

  private normalizeNumber(value: unknown): number | null {
    if (value === undefined || value === null) {
      return null;
    }
    const n =
      typeof value === 'number'
        ? value
        : Number((value as { toString(): string }).toString());
    return Number.isFinite(n) ? n : null;
  }
}
