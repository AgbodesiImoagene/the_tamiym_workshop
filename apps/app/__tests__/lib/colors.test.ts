/**
 * TTW-266: the named colours of `@tamiym/ui` and their search by name. Tested here
 * because `packages/ui` and `apps/admin` have no test runner.
 */
import { findColorByHex, findColorByName, NAMED_COLORS, searchColors } from '@tamiym/ui';

const names = (query: string) => searchColors(query).map((color) => color.name);

describe('named colours', () => {
  it('holds a usable list of common colours', () => {
    expect(NAMED_COLORS.length).toBeGreaterThanOrEqual(30);
    expect(NAMED_COLORS.length).toBeLessThanOrEqual(140);
    expect(NAMED_COLORS.map((color) => color.name)).toEqual(
      expect.arrayContaining(['Black', 'White', 'Green', 'Gray', 'Orange', 'Navy', 'Red'])
    );
  });

  it('gives every colour a six-digit hex code', () => {
    for (const color of NAMED_COLORS) {
      expect(color.hex).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('has each name and each hex code once', () => {
    const lowerNames = NAMED_COLORS.map((color) => color.name.toLowerCase());
    expect(new Set(lowerNames).size).toBe(NAMED_COLORS.length);
    expect(new Set(NAMED_COLORS.map((color) => color.hex)).size).toBe(NAMED_COLORS.length);
  });
});

describe('searchColors', () => {
  it('returns the whole list for an empty search', () => {
    expect(searchColors('')).toEqual(NAMED_COLORS);
    expect(searchColors('   ')).toEqual(NAMED_COLORS);
  });

  it.each(['green', 'GREEN', '  Green  '])('puts the exact name first for "%s"', (query) => {
    expect(names(query)[0]).toBe('Green');
  });

  it('also finds the longer names that contain the search', () => {
    expect(names('green').length).toBeGreaterThan(1);
    for (const name of names('green')) expect(name.toLowerCase()).toContain('green');
  });

  it('puts names that start with the search before names that only contain it', () => {
    const found = names('or');
    expect(found.indexOf('Orange')).toBeGreaterThanOrEqual(0);
    expect(found.indexOf('Orange')).toBeLessThan(found.indexOf('Coral'));
  });

  it('reads "grey" and "gray" as the same word', () => {
    expect(names('grey')[0]).toBe('Gray');
    expect(names('grey')).toEqual(names('gray'));
  });

  it('ignores spaces and hyphens inside a name', () => {
    expect(names('skyblue')[0]).toBe('Sky blue');
    expect(names('sky-blue')[0]).toBe('Sky blue');
  });

  it('returns nothing for an unknown name', () => {
    expect(searchColors('zzzz')).toEqual([]);
    expect(searchColors('#008000')).toEqual([]);
  });
});

describe('findColorByName and findColorByHex', () => {
  it('finds a colour by its exact name, whatever the case or spelling of grey', () => {
    expect(findColorByName('black')).toEqual({ name: 'Black', hex: '#000000' });
    expect(findColorByName(' GREY ')?.name).toBe('Gray');
    expect(findColorByName('blac')).toBeUndefined();
    expect(findColorByName('')).toBeUndefined();
  });

  it('finds a colour by its hex code, whatever the case', () => {
    expect(findColorByHex('#FFFFFF')?.name).toBe('White');
    expect(findColorByHex('#1f3c88')).toBeUndefined();
  });
});
