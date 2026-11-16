import { isISO31661Alpha2 } from 'class-validator';

/**
 * TTW-219: the one rule that turns a country code sent by a client into the code
 * we store and compare with `'NG'`.
 *
 * Unicode NFKC folds full-width and other compatibility forms ("ＮＧ" becomes
 * "NG"), the value is trimmed, must then be exactly two ASCII letters (checked
 * before upper-casing, so a letter such as the dotless "ı" cannot turn into "I"),
 * and must be a real ISO 3166-1 alpha-2 code.
 *
 * @returns the upper-case code, or `null` when the value is not a valid code.
 */
export function canonicalCountryCode(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const folded = value.normalize('NFKC').trim();
  if (!/^[A-Za-z]{2}$/.test(folded)) {
    return null;
  }
  const code = folded.toUpperCase();
  return isISO31661Alpha2(code) ? code : null;
}
