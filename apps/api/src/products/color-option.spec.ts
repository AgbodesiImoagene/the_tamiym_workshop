import { BadRequestException } from '@nestjs/common';
import {
  assertColorMetadata,
  isColorOptionCode,
  isHexColor,
  normalizeOptionCode,
} from './color-option';

describe('colour option rules (TTW-266)', () => {
  it.each(['#000', '#000f', '#1f3c88', '#1F3C88', '#1f3c88cc'])(
    'accepts the hex code %s',
    (hex) => {
      expect(isHexColor(hex)).toBe(true);
    },
  );

  it.each([
    '',
    'green',
    '000000',
    '#00',
    '#00000',
    '#0000000',
    '#ggg',
    ' #000',
    '#000 ',
    '#000\n',
    '#000;background:url(x)',
    null,
    undefined,
    123,
    ['#000'],
  ])('refuses %j', (value) => {
    expect(isHexColor(value)).toBe(false);
  });

  it.each(['color', 'colour', 'Color', 'COLOUR', ' colour '])(
    'recognises "%s" as the colour option',
    (code) => {
      expect(isColorOptionCode(code)).toBe(true);
    },
  );

  it.each(['size', 'colors', 'text-color', ''])(
    'does not treat "%s" as the colour option',
    (code) => {
      expect(isColorOptionCode(code)).toBe(false);
    },
  );

  it.each(['colour', 'Colour', 'COLOUR', ' colour '])(
    'saves the British spelling "%s" as "color"',
    (code) => {
      expect(normalizeOptionCode(code)).toBe('color');
    },
  );

  it('removes the spaces around "color"', () => {
    expect(normalizeOptionCode(' Color ')).toBe('Color');
  });

  it.each(['color', 'Color', 'size', 'colours', 'fit'])(
    'leaves the code "%s" as it is',
    (code) => {
      expect(normalizeOptionCode(code)).toBe(code);
    },
  );

  it.each([
    undefined,
    {},
    { hex: '#008000' },
    { hex: '#008000', pantone: '348 C' },
    { pantone: '348 C' },
  ])('allows colour metadata %j', (metadata) => {
    expect(() => assertColorMetadata(metadata)).not.toThrow();
  });

  it.each([
    null,
    '#008000',
    ['#008000'],
    42,
    { hex: 'green' },
    { hex: '' },
    { hex: null },
    { hex: 8000 },
  ])('refuses colour metadata %j', (metadata) => {
    expect(() => assertColorMetadata(metadata)).toThrow(BadRequestException);
  });
});
