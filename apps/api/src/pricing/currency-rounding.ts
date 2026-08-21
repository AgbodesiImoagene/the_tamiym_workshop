/**
 * Per-currency rounding configuration and helpers.
 *
 * - minorUnitsPerMajor: e.g. 100 for NGN (100 kobo = 1 naira). Defines the smallest
 *   fraction we store; amounts are rounded to 1/minorUnitsPerMajor.
 * - roundingMode: how to round when the value is exactly halfway between two steps.
 * - displayGranularity: optional step for the final total (e.g. 100 = round to nearest
 *   100 NGN). Use 1 to keep minor-unit precision only.
 */

import type { CurrencyCode } from '../generated/prisma/enums';

export const RoundingMode = {
  /** Round half away from zero (2.5 → 3, -2.5 → -3). */
  HALF_UP: 'HALF_UP',
  /** Round half to nearest even (2.5 → 2, 3.5 → 4). Reduces bias over many operations. */
  HALF_EVEN: 'HALF_EVEN',
  /** Always round up (seller never loses; customer may pay a small buffer). */
  CEILING: 'CEILING',
  /** Always round down (buyer-friendly; seller may be short). */
  FLOOR: 'FLOOR',
} as const;

export type RoundingModeType = (typeof RoundingMode)[keyof typeof RoundingMode];

export interface CurrencyRoundingConfig {
  /** Minor units per major (e.g. 100 for NGN → 2 decimal places). */
  minorUnitsPerMajor: number;
  /** How to round when exactly halfway. */
  roundingMode: RoundingModeType;
  /**
   * Step for final total in major units (e.g. 100 = round to nearest 100 NGN).
   * Use 1 for no extra rounding (use minor precision only).
   */
  displayGranularity: number;
}

const defaultConfig: CurrencyRoundingConfig = {
  minorUnitsPerMajor: 100,
  roundingMode: RoundingMode.HALF_EVEN,
  displayGranularity: 1,
};

/** Per-currency rounding. Add entries when supporting more currencies. */
export const CURRENCY_ROUNDING_CONFIG: Partial<
  Record<CurrencyCode, CurrencyRoundingConfig>
> = {
  NGN: {
    minorUnitsPerMajor: 100,
    roundingMode: RoundingMode.HALF_EVEN,
    displayGranularity: 100, // round final total to nearest 100 NGN
  },
};

function getConfig(currency: string): CurrencyRoundingConfig {
  const c = CURRENCY_ROUNDING_CONFIG[currency as CurrencyCode];
  return c ?? defaultConfig;
}

function roundWithMode(
  value: number,
  step: number,
  mode: RoundingModeType,
): number {
  if (step <= 0 || !Number.isFinite(value)) return value;
  const units = value / step;
  let result: number;

  switch (mode) {
    case 'HALF_UP':
      result = Math.round(units) * step;
      break;
    case 'HALF_EVEN': {
      const floor = Math.floor(units);
      const frac = units - floor;
      const rounded =
        frac < 0.5
          ? floor
          : frac > 0.5
            ? floor + 1
            : floor % 2 === 0
              ? floor
              : floor + 1;
      result = rounded * step;
      break;
    }
    case 'CEILING':
      result = Math.ceil(units) * step;
      break;
    case 'FLOOR':
      result = Math.floor(units) * step;
      break;
    default:
      result = Math.round(units) * step;
  }

  // Avoid float noise when step is fractional (e.g. 0.01)
  if (step < 1 && step > 0) {
    const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
    const factor = 10 ** decimals;
    return Math.round(result * factor) / factor;
  }
  return result;
}

/**
 * Round amount to the currency's minor unit (e.g. 2 decimals for NGN).
 * Use for all intermediate and line-level amounts.
 */
export function roundToMinor(amount: number, currency: string): number {
  const config = getConfig(currency);
  const step = 1 / config.minorUnitsPerMajor;
  return roundWithMode(amount, step, config.roundingMode);
}

/**
 * Round amount to the currency's display granularity (e.g. nearest 100 NGN).
 * Use for the final total (and optionally other order-level totals) so displayed
 * amounts match local expectations (e.g. whole 100s in Nigeria).
 */
export function roundToDisplayGranularity(
  amount: number,
  currency: string,
): number {
  const config = getConfig(currency);
  if (config.displayGranularity <= 0) return roundToMinor(amount, currency);
  return roundWithMode(amount, config.displayGranularity, config.roundingMode);
}

/**
 * Convert a major-unit amount to an integer minor-unit count (e.g. NGN → kobo).
 * Input is first rounded with {@link roundToMinor}.
 */
export function toMinorUnits(amountMajor: number, currency: string): number {
  const config = getConfig(currency);
  return Math.round(
    roundToMinor(amountMajor, currency) * config.minorUnitsPerMajor,
  );
}

/**
 * Convert an integer minor-unit count to major units (e.g. kobo → NGN).
 */
export function fromMinorUnits(amountMinor: number, currency: string): number {
  const config = getConfig(currency);
  return amountMinor / config.minorUnitsPerMajor;
}
