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

/** Selected by default: this is a Nigeria-first product. The list itself is alphabetical. */
export const DEFAULT_PHONE_COUNTRY: CountryCode = 'NG';

export interface PhoneCountryOption {
  code: CountryCode;
  name: string;
  callingCode: string;
}

let cachedOptions: PhoneCountryOption[] | undefined;

/** Every country with its calling code, in alphabetical order. */
export function phoneCountryOptions(): PhoneCountryOption[] {
  if (cachedOptions) return cachedOptions;
  const names = new Intl.DisplayNames(['en'], { type: 'region' });
  const options = getCountries().map((code) => ({
    code,
    name: names.of(code) ?? code,
    callingCode: getCountryCallingCode(code),
  }));
  options.sort((a, b) => a.name.localeCompare(b.name, 'en'));
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

/**
 * Countries matching a quick search: digits match the start of the calling code ("44",
 * "+44"), letters match the country name. Empty search: everything.
 */
export function searchPhoneCountries(
  options: PhoneCountryOption[],
  query: string
): PhoneCountryOption[] {
  const text = query.trim().replace(/^\+/, '').toLowerCase();
  if (!text) return options;
  if (/^\d+$/.test(text)) return options.filter((option) => option.callingCode.startsWith(text));
  return options.filter((option) => option.name.toLowerCase().includes(text));
}
