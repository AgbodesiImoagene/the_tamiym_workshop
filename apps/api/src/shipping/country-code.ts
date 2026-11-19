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

let namesToCodes: Map<string, string> | null = null;

/** Fold a country name the way a customer might type it: width, case, spaces. */
function foldCountryName(value: string): string {
  return value.normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * TTW-227: the ISO 3166-1 alpha-2 code of a country name typed by a client, so a
 * name sent without a code ("Ghana") cannot leave the saved code (for example
 * NG) next to a different country text.
 *
 * Names are the English region names of the platform (`Intl.DisplayNames`),
 * compared after NFKC folding, trimming, collapsing spaces and lower-casing. A
 * value that is not a known name (including a bare code such as "GH") gives
 * `null`: the caller keeps its current behaviour.
 */
export function countryCodeFromName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const folded = foldCountryName(value);
  if (!folded) {
    return null;
  }
  if (!namesToCodes) {
    const display = new Intl.DisplayNames(['en'], { type: 'region' });
    const map = new Map<string, string>();
    for (let a = 65; a <= 90; a += 1) {
      for (let b = 65; b <= 90; b += 1) {
        const code = String.fromCharCode(a, b);
        if (!isISO31661Alpha2(code)) {
          continue;
        }
        const name = display.of(code);
        // `of` echoes the code for a region it has no name for.
        if (name && name !== code) {
          map.set(foldCountryName(name), code);
        }
      }
    }
    namesToCodes = map;
  }
  return namesToCodes.get(folded) ?? null;
}
