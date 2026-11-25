/**
 * Phone numbers (TTW-264). The person picks a country and types digits only; the form
 * builds the international number (E.164, for example +2348012345678) the API wants.
 * Same library as the API's validator (class-validator uses libphonenumber-js), so a
 * number accepted here is accepted there.
 */
import {
  getCountries,
  getCountryCallingCode,
  parsePhoneNumberFromString,
  type CountryCode,
} from 'libphonenumber-js/max';

/** Nigeria first: this is a Nigeria-first product. */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'NG';

export interface PhoneCountryOption {
  code: CountryCode;
  name: string;
  callingCode: string;
}

let cachedOptions: PhoneCountryOption[] | undefined;

/** Every country with its calling code, the default country first, then by name. */
export function phoneCountryOptions(): PhoneCountryOption[] {
  if (cachedOptions) return cachedOptions;
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const options = getCountries().map((code) => ({
    code,
    name: names.of(code) ?? code,
    callingCode: getCountryCallingCode(code),
  }));
  options.sort((a, b) =>
    a.code === DEFAULT_PHONE_COUNTRY
      ? -1
      : b.code === DEFAULT_PHONE_COUNTRY
        ? 1
        : a.name.localeCompare(b.name)
  );
  cachedOptions = options;
  return options;
}

export function digitsOnly(raw: string): string {
  return raw.replace(/\D/g, '');
}

/** The international number for a country and typed digits, or null when it is not valid. */
export function toE164(country: CountryCode, digits: string): string | null {
  if (!digits) return null;
  const parsed = parsePhoneNumberFromString(digits, country);
  return parsed?.isValid() ? parsed.number : null;
}

/** Split a saved international number into the country and the digits to show. */
export function splitStoredPhone(stored: string | null | undefined): {
  country: CountryCode;
  digits: string;
} {
  if (!stored) return { country: DEFAULT_PHONE_COUNTRY, digits: '' };
  const parsed = parsePhoneNumberFromString(stored);
  if (parsed?.country) return { country: parsed.country, digits: parsed.nationalNumber };
  return { country: DEFAULT_PHONE_COUNTRY, digits: digitsOnly(stored) };
}
