import { Injectable } from '@nestjs/common';
import { AddressProvider } from '../generated/prisma/enums';
import { PrismaService } from '../prisma/prisma.service';
import type { Prisma } from '../generated/prisma/client';
import { addressStateMismatch, addressStateUnknown } from './shipping.errors';

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
    const stateUnchanged =
      existing !== null && !this.isStateChange(input, existing);
    const resolvedState = await this.resolveState(
      countryCode,
      input,
      admin1Input,
      existing,
      stateUnchanged,
    );

    // TTW-185: an edit that changes the state must not keep the saved state
    // code, nor an LGA from another state. Resending the same state text (the
    // checkout sends the whole address on every save) is not a change.
    const stateChanged =
      existing !== null && this.isStateChange(input, existing);
    // TTW-087: a Nigerian address cannot be saved with a state we do not know.
    // An edit that leaves a saved unknown state untouched is still allowed, so
    // older addresses load and can be corrected.
    if (
      countryCode === 'NG' &&
      !resolvedState &&
      (existing === null || stateChanged || existing.countryCode !== 'NG')
    ) {
      throw addressStateUnknown();
    }
    const stateCode = stateChanged
      ? (resolvedState?.code ?? null)
      : (resolvedState?.code ?? existing?.stateCode ?? null);
    const keepSavedLga =
      !stateChanged || (!!stateCode && stateCode === existing?.stateCode);

    // TTW-193: an explicit `lgaId: null` on an update removes the saved LGA. An
    // absent `lgaId` still keeps it. If the request also names an LGA by text,
    // that text decides. The state is never touched by a clear.
    const lgaCleared =
      existing !== null &&
      input.lgaId === null &&
      !this.clean(input.administrativeAreaLevel2);
    const admin2Input = this.firstDefined(
      this.clean(input.administrativeAreaLevel2),
      keepSavedLga && !lgaCleared
        ? (existing?.administrativeAreaLevel2 ?? null)
        : null,
    );
    // An LGA cannot be checked against a state we do not know.
    const resolvedLga =
      stateChanged && !stateCode
        ? null
        : await this.resolveLga(countryCode, input, stateCode, admin2Input);
    // TTW-186: an edit that changes the LGA never keeps the saved id unless
    // the new LGA resolves to that same row. A saved id is also kept only
    // while the address still has the same known state code it was saved
    // with, so an id never sits beside a null or newly resolved state.
    const lgaChanged = existing !== null && this.isLgaChange(input, existing);
    const lgaId =
      resolvedLga?.id ??
      (keepSavedLga &&
      !lgaCleared &&
      !lgaChanged &&
      !!stateCode &&
      stateCode === existing?.stateCode
        ? existing.lgaId
        : null) ??
      null;
    // A saved state that is no longer offered keeps its saved text: the request
    // text never overwrites it (TTW-216).
    const keepSavedText =
      !resolvedState && stateUnchanged && !!stateCode && existing !== null;
    const administrativeAreaLevel1 = keepSavedText
      ? (existing?.administrativeAreaLevel1 ?? existing?.state ?? null)
      : (resolvedState?.name ?? admin1Input ?? null);
    const administrativeAreaLevel2 = resolvedLga?.name ?? admin2Input ?? null;
    const city = this.firstDefined(
      this.clean(input.city),
      locality,
      existing?.city ?? null,
    );
    // TTW-216: a resolved state is stored under its canonical name, never the
    // text the request sent. Without a resolved state (a saved address whose
    // state is no longer offered) the old text rules still apply.
    const state = resolvedState
      ? resolvedState.name
      : keepSavedText
        ? (existing?.state ?? administrativeAreaLevel1)
        : this.firstDefined(
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

  /**
   * True when the request names a state that differs from the saved one: an
   * explicit `stateCode` other than the saved code, or a state text that
   * matches neither the saved `administrativeAreaLevel1` nor the saved `state`
   * (trimmed, case-insensitive).
   */
  private isStateChange(
    input: AddressNormalizationInput,
    existing: ExistingAddressShape,
  ) {
    const sameText = (a: string | null | undefined, b: string | null) =>
      !!a && !!b && a.toLowerCase() === b.toLowerCase();

    const explicitCode = this.clean(input.stateCode);
    if (explicitCode) {
      return !sameText(this.clean(existing.stateCode), explicitCode);
    }
    const sentText = this.firstDefined(
      this.clean(input.administrativeAreaLevel1),
      this.clean(input.state),
    );
    if (!sentText) {
      return false;
    }
    return (
      !sameText(this.clean(existing.administrativeAreaLevel1), sentText) &&
      !sameText(this.clean(existing.state), sentText)
    );
  }

  /**
   * True when the request names an LGA that differs from the saved one: an
   * explicit `lgaId` other than the saved id, or an LGA text that differs from
   * the saved `administrativeAreaLevel2` (trimmed, case-insensitive).
   */
  private isLgaChange(
    input: AddressNormalizationInput,
    existing: ExistingAddressShape,
  ) {
    const explicitId = this.clean(input.lgaId);
    if (explicitId) {
      return explicitId !== (existing.lgaId ?? null);
    }
    const sentText = this.clean(input.administrativeAreaLevel2);
    if (!sentText) {
      return false;
    }
    const savedText = this.clean(existing.administrativeAreaLevel2);
    return !savedText || savedText.toLowerCase() !== sentText.toLowerCase();
  }

  /**
   * The active `GeoState` the address belongs to, or null. TTW-216: the code
   * identifies the state and decides the text.
   *  - An explicit `stateCode` wins; a state text that names another known
   *    state is a contradiction (400), a text that matches no state is replaced
   *    by the canonical name.
   *  - With no code, two state texts that name different states are a
   *    contradiction too.
   *  - An edit that does not change the state (names none, or resends the saved
   *    text) resolves from the saved code first (a saved mismatched pair is
   *    settled by its code), then from the saved text.
   * A deactivated or unknown code stays unknown (TTW-194) and is checked
   * before any mismatch, so the answer never tells the two apart.
   */
  private async resolveState(
    countryCode: string,
    input: AddressNormalizationInput,
    admin1: string | null,
    existing: ExistingAddressShape | null,
    stateUnchanged: boolean,
  ) {
    if (countryCode !== 'NG') {
      return null;
    }
    const sentTexts = this.distinctTexts(
      this.clean(input.administrativeAreaLevel1),
      this.clean(input.state),
    );
    const explicitCode = this.clean(input.stateCode)?.toUpperCase();
    if (explicitCode) {
      const state = await this.prisma.geoState.findUnique({
        where: { code: explicitCode },
      });
      // TTW-194: a deactivated state is as unknown as one that does not exist.
      const isActive = !!state && state.isActive !== false;
      // The saved code of a legacy row may be deactivated; an edit of it that
      // names another state is still a contradiction.
      const isSavedCode =
        !!existing &&
        this.clean(existing.stateCode)?.toUpperCase() === explicitCode;
      if (state && (isActive || isSavedCode)) {
        await this.assertTextsAgree(state.code, sentTexts);
      }
      return isActive ? state : null;
    }
    if (sentTexts.length > 1) {
      await this.assertTextsAgree(null, sentTexts);
    }
    const savedCode = this.clean(existing?.stateCode)?.toUpperCase();
    if (stateUnchanged && savedCode) {
      const saved = await this.prisma.geoState.findUnique({
        where: { code: savedCode },
      });
      if (saved && saved.isActive !== false) {
        return saved;
      }
    }
    if (!admin1) {
      return null;
    }
    return this.prisma.geoState.findFirst({
      where: {
        isActive: true,
        OR: [
          { code: admin1.toUpperCase() },
          { name: { equals: admin1, mode: 'insensitive' } },
        ],
      },
    });
  }

  /**
   * TTW-216: refuse a request that names two different active states. A text
   * that matches no active state (a typo, or a deactivated state) is not a
   * contradiction: the code decides and the text is replaced. Counting only
   * active states keeps the answer from telling a deactivated state from one
   * that does not exist.
   */
  private async assertTextsAgree(
    code: string | null,
    texts: string[],
  ): Promise<void> {
    const codes = new Set<string>(code ? [code] : []);
    for (const text of texts) {
      const found = await this.prisma.geoState.findFirst({
        where: {
          isActive: true,
          OR: [
            { code: text.toUpperCase() },
            { name: { equals: text, mode: 'insensitive' } },
          ],
        },
      });
      if (found) {
        codes.add(found.code);
      }
    }
    if (codes.size > 1) {
      throw addressStateMismatch();
    }
  }

  private distinctTexts(...values: Array<string | null>) {
    const seen = new Map<string, string>();
    for (const value of values) {
      if (value && !seen.has(value.toLowerCase())) {
        seen.set(value.toLowerCase(), value);
      }
    }
    return [...seen.values()];
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
    const lgaId = this.clean(input.lgaId);
    let lga;
    if (lgaId) {
      // TTW-186: an LGA cannot be checked against a state we do not know, and
      // the state is never derived from the LGA row.
      if (!stateCode) {
        return null;
      }
      lga = await this.prisma.geoLga.findFirst({
        where: { id: lgaId, stateCode },
      });
    } else {
      if (!admin2 || !stateCode) {
        return null;
      }
      lga = await this.prisma.geoLga.findFirst({
        where: {
          stateCode,
          name: { equals: admin2, mode: 'insensitive' },
        },
      });
    }
    // TTW-202: a deactivated LGA is as unknown as one that does not exist, so
    // it is never linked. A saved address keeps the id it already has.
    return lga?.isActive === false ? null : lga;
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
