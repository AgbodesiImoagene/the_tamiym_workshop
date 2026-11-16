import { canonicalCountryCode } from './country-code';

/** TTW-219: one rule for the country code of an address. */
describe('canonicalCountryCode', () => {
  it.each([
    ['NG', 'NG'],
    ['ng', 'NG'],
    ['Ng', 'NG'],
    ['ＮＧ', 'NG'], // full-width NG
    ['ｎｇ', 'NG'], // full-width ng
    ['ＮG', 'NG'], // mixed width
    [' NG ', 'NG'],
    ['gh', 'GH'],
    ['US', 'US'],
  ])('accepts %j as %s', (value, expected) => {
    expect(canonicalCountryCode(value)).toBe(expected);
  });

  it.each([
    [''],
    ['  '],
    ['N'],
    ['NGA'],
    ['N1'],
    ['XX'], // two letters, not an ISO code
    ['ZZ'],
    ['ıt'], // dotless i would upper-case to "IT"
    ['N​G'], // zero-width space inside
    ['N\u0000'],
    ['Ｎ'],
    [null],
    [undefined],
    [42],
    [{}],
  ])('refuses %j', (value) => {
    expect(canonicalCountryCode(value)).toBeNull();
  });
});
